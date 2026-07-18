import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { ClsService } from 'nestjs-cls';
import { TenantService } from '../../../database/tenant.service';
import { AuthService } from '../../../auth/auth.service';

@Injectable()
export class RolesService {
  // Roles live in the per-tenant schema, so every operation must run inside the
  // tenant transaction (via TenantService). A plain default-connection
  // repository would target the public schema, where the roles table does not
  // exist.
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Returns the ids of every user currently holding the role.
   *
   * Editing or deleting a role changes the effective permissions of ALL its
   * holders at once, so the cached permission set of each one has to be dropped
   * — invalidating only the acting user would leave everyone else on stale
   * (potentially over-privileged) permissions until the 60s TTL expired.
   */
  private async findRoleHolderIds(
    manager: EntityManager,
    roleId: string,
  ): Promise<string[]> {
    const rows = await manager.query(
      `SELECT user_id FROM user_roles WHERE role_id = $1`,
      [roleId],
    );
    return rows.map((row: { user_id: string }) => row.user_id);
  }

  /**
   * Drops the cached permissions of the given users in the current tenant.
   * Best-effort by design: the mutation is already committed, and the 60s TTL
   * is the backstop if the cache is momentarily unreachable.
   */
  private async invalidateUsers(userIds: string[]): Promise<void> {
    const companyId = this.cls.get('companyId');
    if (!companyId || userIds.length === 0) return;

    await Promise.all(
      userIds.map((userId) =>
        this.authService.invalidateUserPermissions(companyId, userId),
      ),
    );
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

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
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

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
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
