import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { ClsService } from 'nestjs-cls';
import { TenantService } from '../../../database/tenant.service';
import { AuthService } from '../../../auth/auth.service';
import { RolesResolverService } from './roles-resolver.service';
import {
  findDependentRoleHolderIds,
  roleSetInheritsRole,
} from '../permissions/flattened-permissions.query';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  // Roles live in the per-tenant schema, so every operation must run inside the
  // tenant transaction (via TenantService). A plain default-connection
  // repository would target the public schema, where the roles table does not
  // exist.
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
    private readonly cls: ClsService,
    private readonly rolesResolver: RolesResolverService,
  ) {}

  /**
   * Returns the ids of every user whose effective permissions depend on the
   * role — its direct holders AND the holders of every role that inherits from
   * it, transitively.
   *
   * Editing or deleting a role changes the effective permissions of ALL its
   * holders at once, so the cached permission set of each one has to be dropped
   * — invalidating only the acting user would leave everyone else on stale
   * (potentially over-privileged) permissions until the 60s TTL expired.
   *
   * The descendant walk is the part that inheritance makes mandatory: a user
   * holding only "Editor" never appears in user_roles for "Admin", yet editing
   * "Admin" changes what that user can do the moment Editor inherits from it.
   * Invalidating direct holders alone would serve that user stale,
   * over-privileged permissions for the full cache TTL.
   */
  private async findRoleHolderIds(
    manager: EntityManager,
    roleId: string,
  ): Promise<string[]> {
    return findDependentRoleHolderIds(manager, roleId);
  }

  /**
   * Drops the cached permissions of the given users in the current tenant.
   * Best-effort by design: the mutation is already committed, and the 60s TTL
   * is the backstop if the cache is momentarily unreachable — so a cache
   * failure here is logged, never surfaced to the client as an error on a
   * write that already succeeded.
   */
  private async invalidateUsers(userIds: string[]): Promise<void> {
    const companyId = this.cls.get('companyId');
    if (!companyId || userIds.length === 0) return;

    try {
      await Promise.all(
        userIds.map((userId) =>
          this.authService.invalidateUserPermissions(companyId, userId),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Permission cache invalidation failed for ${userIds.length} user(s) in company ${String(companyId)}; stale entries expire with the TTL: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Rejects any attempt to put a permission into a role that the acting user
   * does not itself hold.
   *
   * MANAGE_ROLES alone used to be enough to mint a role carrying ANY
   * permission — including platform-level MANAGE_TENANTS — and then self-assign
   * it through the user-roles endpoint. That is vertical privilege escalation:
   * one delegated capability silently becomes all of them. Grants are therefore
   * bounded by the actor's own effective permission set.
   *
   * Reads through AuthService rather than trusting the request payload: that is
   * the authoritative, cache-invalidated source the guards themselves use.
   */
  private async assertCanGrant(
    actorUserId: string,
    permissions?: string[],
  ): Promise<void> {
    if (!permissions || permissions.length === 0) return;

    const companyId = this.cls.get('companyId');
    // Fail closed: without a tenant context the actor's permissions cannot be
    // resolved, so no grant can be proven safe.
    if (!companyId || !actorUserId) {
      throw new ForbiddenException(
        'Cannot verify the acting user permissions for this tenant',
      );
    }

    const actorPermissions = new Set(
      await this.authService.getUserPermissions(actorUserId, companyId),
    );

    const notGrantable = permissions.filter((p) => !actorPermissions.has(p));
    if (notGrantable.length > 0) {
      throw new ForbiddenException(
        `You cannot grant permissions you do not hold: ${notGrantable.join(', ')}`,
      );
    }
  }

  /**
   * The full set of permissions a grant would confer: the direct permissions
   * payload UNION every permission the inherited roles carry (transitively).
   * Feeding this single set to assertCanGrant closes the inheritance-escalation
   * path — an actor cannot smuggle in permissions through a parent role they do
   * not themselves hold.
   */
  private async grantedPermissions(
    directPermissions: string[] | undefined,
    inheritedRoleIds: string[] | undefined,
  ): Promise<string[]> {
    const inherited =
      await this.rolesResolver.getEffectivePermissionsForRoleIds(
        inheritedRoleIds ?? [],
      );
    return Array.from(new Set([...(directPermissions ?? []), ...inherited]));
  }

  /**
   * Replaces a user's role assignments, bounded by the actor's own authority.
   *
   * Assigning a role hands the target every permission that role effectively
   * confers — including everything it inherits — so MANAGE_USERS alone must not
   * be able to assign, say, the Super Admin role (to anyone, including the
   * actor themselves). The same rule assertCanGrant enforces for role authoring
   * therefore has to gate assignment too; without it, MANAGE_USERS is a blank
   * cheque for vertical privilege escalation.
   *
   * Lives here rather than in the controller because the grant-boundary check
   * (assertCanGrant) and the effective-permission resolution already live on
   * this service; duplicating them into the controller would fork the security
   * rule across two places.
   */
  async assignRolesToUser(
    actorUserId: string,
    targetUserId: string,
    roleIds: string[],
  ): Promise<void> {
    // Bound the assignment by what the actor may grant. Empty roleIds (clearing
    // all roles) confers nothing, so assertCanGrant is a no-op there — removing
    // authority is never an escalation.
    await this.assertCanGrant(
      actorUserId,
      await this.rolesResolver.getEffectivePermissionsForRoleIds(roleIds),
    );

    // Tenant-scoped and atomic: runInTenant wraps the replace in one
    // transaction, so a failed insert can no longer leave the user role-less.
    await this.tenantService.runInTenant(async (manager) => {
      const repo = manager.getRepository(UserRole);
      await repo.delete({ userId: targetUserId });

      if (roleIds.length > 0) {
        const newUserRoles = roleIds.map((roleId) =>
          repo.create({ userId: targetUserId, roleId }),
        );
        await repo.save(newUserRoles);
      }
    });

    // The user's effective permissions just changed; drop the cached set after
    // the transaction commits so the very next request re-reads them instead of
    // running on the previous role set for up to 60s.
    await this.invalidateUsers([targetUserId]);
  }

  async findAll(): Promise<Role[]> {
    return this.tenantService.runInTenant((manager) =>
      manager.getRepository(Role).find({ relations: ['inheritedRoles'] }),
    );
  }

  async findOne(id: string): Promise<Role> {
    return this.tenantService.runInTenant((manager) =>
      this.findOneWith(manager, id),
    );
  }

  private async findOneWith(manager: EntityManager, id: string): Promise<Role> {
    const role = await manager
      .getRepository(Role)
      .findOne({ where: { id }, relations: ['inheritedRoles'] });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async create(
    createRoleDto: CreateRoleDto,
    actorUserId: string,
  ): Promise<Role> {
    // A role grants its direct permissions AND everything its inherited roles
    // confer. Check both together so an actor cannot mint a role that inherits,
    // say, Super Admin and thereby carries permissions they lack.
    await this.assertCanGrant(
      actorUserId,
      await this.grantedPermissions(
        createRoleDto.permissions,
        createRoleDto.inheritedRoleIds,
      ),
    );

    return this.tenantService.runInTenant(async (manager) => {
      const repo = manager.getRepository(Role);
      const { inheritedRoleIds, ...roleData } = createRoleDto;

      const role = repo.create(roleData);

      if (inheritedRoleIds && inheritedRoleIds.length > 0) {
        role.inheritedRoles = await repo.findBy({ id: In(inheritedRoleIds) });
      }

      return repo.save(role);
    });
  }

  /**
   * Serializes role-inheritance mutations per tenant schema. The cycle guard
   * is check-then-write under READ COMMITTED: two concurrent updates (A
   * inherits B, B inherits A) touch disjoint role_inheritance rows, so nothing
   * else orders them and both could pass the check and commit a cycle. A
   * transaction-scoped advisory lock makes the second writer wait until the
   * first commits, so its guard query sees the fresh edges. Keyed on the
   * current schema to stay per-tenant, and released automatically at
   * commit/rollback. Admin-frequency writes only — reads are unaffected.
   */
  private async lockRoleInheritance(manager: EntityManager): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('role_inheritance:' || current_schema(), 0))",
    );
  }

  async update(
    id: string,
    updateRoleDto: UpdateRoleDto,
    actorUserId: string,
  ): Promise<Role> {
    // Checked against the full submitted set, not just the delta: the payload
    // replaces the role's permissions wholesale, so anything left in it is a
    // grant the actor is making right now. Inherited roles count too — changing
    // inheritance to a higher-privileged parent is just as much a grant as
    // adding the permission directly.
    await this.assertCanGrant(
      actorUserId,
      await this.grantedPermissions(
        updateRoleDto.permissions,
        updateRoleDto.inheritedRoleIds,
      ),
    );

    const { role, holderIds } = await this.tenantService.runInTenant(
      async (manager) => {
        const repo = manager.getRepository(Role);
        const role = await this.findOneWith(manager, id);

        if (role.isSystemDefault && updateRoleDto.name) {
          throw new ConflictException('Cannot rename a system default role');
        }

        const { inheritedRoleIds, ...roleData } = updateRoleDto;
        Object.assign(role, roleData);

        if (inheritedRoleIds !== undefined) {
          if (inheritedRoleIds.includes(id)) {
            throw new ConflictException('A role cannot inherit from itself');
          }
          // Cycle guard. Only update can close a cycle: a role being CREATED
          // does not exist yet, so no persisted role can already inherit it —
          // and that also covers the concurrent case, since no other
          // transaction can reference an uncommitted role id, which is why
          // create takes no lock. The read CTEs are merely cycle-tolerant; a
          // persisted cycle would grant every role in the ring the union of
          // all their permissions, so it is rejected inside the same
          // transaction that would write it.
          await this.lockRoleInheritance(manager);
          if (await roleSetInheritsRole(manager, inheritedRoleIds, id)) {
            throw new BadRequestException(
              'Role inheritance cannot form a cycle: an inherited role already inherits this role',
            );
          }
          role.inheritedRoles = await repo.findBy({ id: In(inheritedRoleIds) });
        }

        const holderIds = await this.findRoleHolderIds(manager, id);
        return { role: await repo.save(role), holderIds };
      },
    );

    // Only after the transaction commits, so a rolled-back update can never
    // leave the cache cleared against permissions that were never persisted.
    await this.invalidateUsers(holderIds);
    return role;
  }

  async remove(id: string): Promise<void> {
    const holderIds = await this.tenantService.runInTenant(async (manager) => {
      const repo = manager.getRepository(Role);
      const role = await this.findOneWith(manager, id);

      if (role.isSystemDefault) {
        throw new ConflictException('Cannot delete a system default role');
      }

      // Read the holders before the delete: the user_roles rows are gone (or
      // the delete is rejected) once it runs.
      const holderIds = await this.findRoleHolderIds(manager, id);

      // FK constraints (RESTRICT) block deletion of roles that are assigned or
      // inherited; surface that as a 409 instead of a raw driver error.
      try {
        await repo.delete(id);
      } catch (error) {
        if (error.code === '23503') {
          throw new ConflictException(
            'Cannot delete role because it is assigned to users or inherited by other roles',
          );
        }
        throw error;
      }

      return holderIds;
    });

    await this.invalidateUsers(holderIds);
  }
}
