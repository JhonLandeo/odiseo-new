import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RolesService } from './roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { PERMISSIONS } from '../constants/permissions.constant';

const COMPANY_ID = 'company-1';
const ACTOR_ID = 'actor-1';

function createService(
  actorPermissions: string[],
  companyId: any = COMPANY_ID,
  // Permissions the inherited/assigned roleIds would confer, as resolved by the
  // role-set effective-permissions query. Defaults to none.
  inheritedPermissions: string[] = [],
) {
  const savedRole = { id: 'role-1', name: 'Coordinator' };
  const repo = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn().mockResolvedValue(savedRole),
    findBy: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'role-1', name: 'Coordinator' }),
    delete: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue(repo),
    query: jest.fn().mockResolvedValue([]),
  };
  const tenantService = {
    runInTenant: jest.fn((op: (m: any) => Promise<any>) => op(manager)),
  };
  const authService = {
    getUserPermissions: jest.fn().mockResolvedValue(actorPermissions),
    revokeUserTokens: jest.fn().mockResolvedValue(undefined),
  };
  const cls = { get: jest.fn().mockReturnValue(companyId) };
  const rolesResolver = {
    getEffectivePermissionsForRoleIds: jest
      .fn()
      .mockResolvedValue(inheritedPermissions),
  };

  const service = new RolesService(
    tenantService as any,
    authService as any,
    cls as any,
    rolesResolver as any,
  );
  return {
    service,
    repo,
    manager,
    tenantService,
    authService,
    cls,
    rolesResolver,
  };
}

// ─────────────────────────────── A3: DTO vocabulary ───────────────
describe('Role DTO permission validation (A3)', () => {
  it('rejects a permission outside the canonical vocabulary', async () => {
    const dto = plainToInstance(CreateRoleDto, {
      name: 'Typo Role',
      permissions: ['MANAGE_USER'], // MANAGE_USERS is the real one
    });

    const errors = await validate(dto);
    const permissionError = errors.find((e) => e.property === 'permissions');
    expect(permissionError).toBeDefined();
    expect(JSON.stringify(permissionError?.constraints)).toContain(
      'MANAGE_USERS',
    );
  });

  it('accepts permissions drawn from PERMISSIONS', async () => {
    const dto = plainToInstance(CreateRoleDto, {
      name: 'Valid Role',
      permissions: [PERMISSIONS.VIEW_SYLLABUS, PERMISSIONS.EDIT_SYLLABUS],
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('applies the same vocabulary on update', async () => {
    const dto = plainToInstance(UpdateRoleDto, {
      permissions: ['NOT_A_PERMISSION'],
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'permissions')).toBe(true);
  });
});

// ─────────────────────────────── A4: escalation guard ─────────────
describe('RolesService privilege escalation guard (A4)', () => {
  afterEach(() => jest.clearAllMocks());

  it('blocks create when the actor does not hold the requested permission', async () => {
    const { service, repo } = createService([PERMISSIONS.MANAGE_ROLES]);

    await expect(
      service.create(
        {
          name: 'Escalated',
          permissions: [PERMISSIONS.MANAGE_TENANTS],
        } as CreateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('names every permission the actor may not grant', async () => {
    const { service } = createService([PERMISSIONS.MANAGE_ROLES]);

    await expect(
      service.create(
        {
          name: 'Escalated',
          permissions: [PERMISSIONS.MANAGE_TENANTS, PERMISSIONS.MANAGE_USERS],
        } as CreateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(/MANAGE_TENANTS.*MANAGE_USERS/);
  });

  it('allows create when the actor holds every requested permission', async () => {
    const { service, repo } = createService([
      PERMISSIONS.MANAGE_ROLES,
      PERMISSIONS.VIEW_SYLLABUS,
    ]);

    const role = await service.create(
      {
        name: 'Reader',
        permissions: [PERMISSIONS.VIEW_SYLLABUS],
      } as CreateRoleDto,
      ACTOR_ID,
    );

    expect(role).toEqual({ id: 'role-1', name: 'Coordinator' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('blocks update that adds a permission the actor does not hold', async () => {
    const { service, repo } = createService([PERMISSIONS.MANAGE_ROLES]);

    await expect(
      service.update(
        'role-1',
        { permissions: [PERMISSIONS.MANAGE_TENANTS] } as UpdateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('skips the check when the payload carries no permissions', async () => {
    const { service, authService, repo } = createService([]);

    await service.update(
      'role-1',
      { name: 'Renamed' } as UpdateRoleDto,
      ACTOR_ID,
    );

    expect(authService.getUserPermissions).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('fails closed when the tenant context is missing', async () => {
    // Explicit null: `undefined` would fall back to the default parameter.
    const { service } = createService([PERMISSIONS.MANAGE_TENANTS], null);

    await expect(
      service.create(
        {
          name: 'Anything',
          permissions: [PERMISSIONS.MANAGE_TENANTS],
        } as CreateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reads permissions from AuthService, not from the caller', async () => {
    const { service, authService } = createService([PERMISSIONS.VIEW_SYLLABUS]);

    await service.create(
      {
        name: 'Reader',
        permissions: [PERMISSIONS.VIEW_SYLLABUS],
      } as CreateRoleDto,
      ACTOR_ID,
    );

    expect(authService.getUserPermissions).toHaveBeenCalledWith(
      ACTOR_ID,
      COMPANY_ID,
    );
  });
});

// ─────────── A5: inheritance-based escalation guard (create/update) ─
describe('RolesService inheritance escalation guard (A5)', () => {
  afterEach(() => jest.clearAllMocks());

  it('blocks create that inherits a role conferring a permission the actor lacks', async () => {
    // Actor holds MANAGE_ROLES only; the inherited role carries MANAGE_TENANTS.
    const { service, repo, rolesResolver } = createService(
      [PERMISSIONS.MANAGE_ROLES],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await expect(
      service.create(
        {
          name: 'Inherits Super Admin',
          inheritedRoleIds: ['super-admin-role'],
        } as CreateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(
      rolesResolver.getEffectivePermissionsForRoleIds,
    ).toHaveBeenCalledWith(['super-admin-role']);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('allows create that inherits a role whose permissions the actor holds', async () => {
    const { service, repo } = createService(
      [PERMISSIONS.MANAGE_ROLES, PERMISSIONS.VIEW_SYLLABUS],
      COMPANY_ID,
      [PERMISSIONS.VIEW_SYLLABUS],
    );

    await service.create(
      {
        name: 'Inherits Reader',
        inheritedRoleIds: ['reader-role'],
      } as CreateRoleDto,
      ACTOR_ID,
    );

    expect(repo.save).toHaveBeenCalled();
  });

  it('blocks update that switches inheritance to a higher-privileged parent', async () => {
    const { service, repo } = createService(
      [PERMISSIONS.MANAGE_ROLES],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await expect(
      service.update(
        'role-1',
        { inheritedRoleIds: ['super-admin-role'] } as UpdateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('checks direct AND inherited permissions together', async () => {
    // Direct payload is fine, but the inherited role smuggles in MANAGE_TENANTS.
    const { service, repo, authService } = createService(
      [PERMISSIONS.MANAGE_ROLES, PERMISSIONS.VIEW_SYLLABUS],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await expect(
      service.create(
        {
          name: 'Sneaky',
          permissions: [PERMISSIONS.VIEW_SYLLABUS],
          inheritedRoleIds: ['super-admin-role'],
        } as CreateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(/MANAGE_TENANTS/);

    expect(authService.getUserPermissions).toHaveBeenCalledWith(
      ACTOR_ID,
      COMPANY_ID,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('lets a full super admin inherit anything', async () => {
    const { service, repo } = createService(
      [
        PERMISSIONS.MANAGE_ROLES,
        PERMISSIONS.MANAGE_USERS,
        PERMISSIONS.MANAGE_TENANTS,
        PERMISSIONS.VIEW_SYLLABUS,
      ],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await service.create(
      {
        name: 'Inherits Super Admin',
        inheritedRoleIds: ['super-admin-role'],
      } as CreateRoleDto,
      ACTOR_ID,
    );

    expect(repo.save).toHaveBeenCalled();
  });
});

// ─────────────── A6: assignment escalation guard (assignRoles) ─────
describe('RolesService.assignRolesToUser escalation guard (A6)', () => {
  afterEach(() => jest.clearAllMocks());

  it('blocks assigning a role that confers a permission the actor lacks', async () => {
    // MANAGE_USERS alone must not be able to hand out Super Admin.
    const { service, repo, rolesResolver } = createService(
      [PERMISSIONS.MANAGE_USERS],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await expect(
      service.assignRolesToUser(ACTOR_ID, 'target-user', ['super-admin-role']),
    ).rejects.toThrow(ForbiddenException);

    expect(
      rolesResolver.getEffectivePermissionsForRoleIds,
    ).toHaveBeenCalledWith(['super-admin-role']);
    // Nothing was written: the guard runs before the transaction.
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('allows assigning roles fully within the actor permissions', async () => {
    const { service, repo, authService } = createService(
      [PERMISSIONS.MANAGE_USERS, PERMISSIONS.VIEW_SYLLABUS],
      COMPANY_ID,
      [PERMISSIONS.VIEW_SYLLABUS],
    );

    await service.assignRolesToUser(ACTOR_ID, 'target-user', ['reader-role']);

    expect(repo.delete).toHaveBeenCalledWith({ userId: 'target-user' });
    expect(repo.save).toHaveBeenCalled();
    // The target's tokens are revoked (and cache dropped) after the write.
    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'target-user',
    );
  });

  it('lets a full super admin assign any role', async () => {
    const { service, repo } = createService(
      [
        PERMISSIONS.MANAGE_USERS,
        PERMISSIONS.MANAGE_ROLES,
        PERMISSIONS.MANAGE_TENANTS,
      ],
      COMPANY_ID,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await service.assignRolesToUser(ACTOR_ID, 'target-user', [
      'super-admin-role',
    ]);

    expect(repo.save).toHaveBeenCalled();
  });

  it('allows clearing all roles (empty set confers nothing)', async () => {
    const { service, repo, rolesResolver } = createService(
      [PERMISSIONS.MANAGE_USERS],
      COMPANY_ID,
      [],
    );

    await service.assignRolesToUser(ACTOR_ID, 'target-user', []);

    // No role rows to write; the delete still runs to clear existing ones.
    expect(
      rolesResolver.getEffectivePermissionsForRoleIds,
    ).toHaveBeenCalledWith([]);
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'target-user' });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('fails closed when the tenant context is missing', async () => {
    const { service, repo } = createService(
      [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_TENANTS],
      null,
      [PERMISSIONS.MANAGE_TENANTS],
    );

    await expect(
      service.assignRolesToUser(ACTOR_ID, 'target-user', ['super-admin-role']),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });
});

// ───────────────── 009: write-time inheritance cycle prevention ────
describe('RolesService inheritance cycle prevention (009)', () => {
  afterEach(() => jest.clearAllMocks());

  // The cycle guard walks the ancestor closure of the PROPOSED parents; the
  // holder fan-out walks descendants. Dispatch on the CTE name so each query
  // answers independently of call order.
  function primeQueries(
    manager: { query: jest.Mock },
    ancestorRowsOfProposedParents: Array<{ found: number }>,
  ) {
    manager.query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('dependent_roles') ? [] : ancestorRowsOfProposedParents,
      ),
    );
  }

  it('rejects direct self-inheritance before touching the database', async () => {
    const { service, repo, manager } = createService([]);

    await expect(
      service.update(
        'role-A',
        { inheritedRoleIds: ['role-A'] } as UpdateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(ConflictException);

    expect(manager.query).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a two-role cycle: A inherits B while B already inherits A', async () => {
    const { service, repo, manager } = createService([]);
    // B's ancestor closure contains A, so the guard query finds the target.
    primeQueries(manager, [{ found: 1 }]);

    await expect(
      service.update(
        'role-A',
        { inheritedRoleIds: ['role-B'] } as UpdateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a transitive cycle: A inherits B, B → C, C → A', async () => {
    const { service, repo, manager } = createService([]);
    // The recursive walk reaches A through C, two hops from the seed.
    primeQueries(manager, [{ found: 1 }]);

    await expect(
      service.update(
        'role-A',
        { inheritedRoleIds: ['role-B'] } as UpdateRoleDto,
        ACTOR_ID,
      ),
    ).rejects.toThrow(/cycle/i);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('asks the database for the ancestor closure of the proposed parents', async () => {
    const { service, manager } = createService([]);
    primeQueries(manager, []);

    await service.update(
      'role-D',
      { inheritedRoleIds: ['role-B', 'role-C'] } as UpdateRoleDto,
      ACTOR_ID,
    );

    const [sql, params] = manager.query.mock.calls[1];
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).not.toContain('UNION ALL');
    expect(params).toEqual([['role-B', 'role-C'], 'role-D']);
  });

  // TOCTOU guard: without the advisory lock, two concurrent updates writing
  // disjoint role_inheritance rows both pass the check and commit a cycle.
  it('takes the per-schema advisory lock before running the cycle check', async () => {
    const { service, manager } = createService([]);
    primeQueries(manager, []);

    await service.update(
      'role-D',
      { inheritedRoleIds: ['role-B'] } as UpdateRoleDto,
      ACTOR_ID,
    );

    const sqls = manager.query.mock.calls.map((call) => String(call[0]));
    const lockIndex = sqls.findIndex((sql) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const cycleIndex = sqls.findIndex((sql) => sql.includes('WITH RECURSIVE'));
    expect(lockIndex).toBe(0);
    expect(sqls[lockIndex]).toContain('role_inheritance');
    expect(cycleIndex).toBeGreaterThan(lockIndex);
  });

  it('accepts a diamond: D inherits B and C, both inheriting A', async () => {
    const { service, repo, manager } = createService([]);
    // The closure of {B, C} is {B, C, A} — D is not in it, so no cycle.
    primeQueries(manager, []);

    await service.update(
      'role-D',
      { inheritedRoleIds: ['role-B', 'role-C'] } as UpdateRoleDto,
      ACTOR_ID,
    );

    expect(repo.save).toHaveBeenCalled();
  });
});

// ───────────────────── A: inheritance-aware cache invalidation ─────
describe('RolesService cache invalidation with role inheritance', () => {
  afterEach(() => jest.clearAllMocks());

  it('invalidates holders of DESCENDANT roles when a parent role is edited', async () => {
    const { service, manager, authService } = createService([]);
    // The descendant walk resolves in SQL; the service must fan out over
    // whatever it returns, not just over direct user_roles rows.
    manager.query.mockResolvedValue([
      { user_id: 'direct-holder' },
      { user_id: 'child-role-holder' },
    ]);

    await service.update(
      'role-1',
      { name: 'Renamed' } as UpdateRoleDto,
      ACTOR_ID,
    );

    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'direct-holder',
    );
    // The security-relevant half: this user holds only a CHILD role, so
    // editing the parent silently changed their effective permissions.
    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'child-role-holder',
    );
  });

  it('resolves holders through the descendant-walking query, not a flat lookup', async () => {
    const { service, manager } = createService([]);
    manager.query.mockResolvedValue([]);

    await service.update(
      'role-1',
      { name: 'Renamed' } as UpdateRoleDto,
      ACTOR_ID,
    );

    const [sql, params] = manager.query.mock.calls.at(-1);
    expect(sql).toContain('dependent_roles');
    expect(sql).toContain('ri.parent_role_id = dr.role_id');
    expect(params).toEqual(['role-1']);
  });

  it('also fans out to descendant holders on delete', async () => {
    const { service, manager, authService } = createService([]);
    manager.query.mockResolvedValue([{ user_id: 'child-role-holder' }]);

    await service.remove('role-1');

    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'child-role-holder',
    );
  });

  // The role mutation has ALREADY committed by the time invalidateUsers runs,
  // so a revocation failure must never make an already-succeeded request
  // report as failed — that would be a misleading signal (the role change
  // genuinely happened). Logged loudly instead; see invalidateUsers' own
  // doc comment.
  it('does not fail an update when revocation fails, but logs it loudly', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, manager, authService } = createService([]);
    manager.query.mockResolvedValue([{ user_id: 'direct-holder' }]);
    authService.revokeUserTokens.mockRejectedValue(new Error('DB down'));

    await expect(
      service.update('role-1', { name: 'Renamed' } as UpdateRoleDto, ACTOR_ID),
    ).resolves.toBeDefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('direct-holder'),
    );
  });

  it('does not fail an assignment when revocation fails, but logs it loudly', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, authService } = createService([]);
    authService.revokeUserTokens.mockRejectedValue(new Error('DB down'));

    await expect(
      service.assignRolesToUser(ACTOR_ID, 'target-user', []),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('target-user'),
    );
  });

  it('does not log when every holder revokes successfully', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, manager, authService } = createService([]);
    manager.query.mockResolvedValue([{ user_id: 'direct-holder' }]);
    authService.revokeUserTokens.mockResolvedValue(undefined);

    await service.update('role-1', { name: 'Renamed' } as UpdateRoleDto, ACTOR_ID);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Promise.allSettled exists specifically for this: one holder's DB failure
  // must not abort the others still in flight, and the log must name exactly
  // the ones that failed — not all of them, not none of them.
  it('revokes every succeeding holder and names only the failing one when outcomes are mixed', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, manager, authService } = createService([]);
    manager.query.mockResolvedValue([
      { user_id: 'holder-ok-1' },
      { user_id: 'holder-fails' },
      { user_id: 'holder-ok-2' },
    ]);
    authService.revokeUserTokens.mockImplementation((_companyId, userId) =>
      userId === 'holder-fails'
        ? Promise.reject(new Error('DB down'))
        : Promise.resolve(undefined),
    );

    await expect(
      service.update('role-1', { name: 'Renamed' } as UpdateRoleDto, ACTOR_ID),
    ).resolves.toBeDefined();

    // The other holders' calls were made, not skipped because one rejected.
    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'holder-ok-1',
    );
    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      COMPANY_ID,
      'holder-ok-2',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(String(message)).toContain('holder-fails');
    expect(String(message)).not.toContain('holder-ok-1');
    expect(String(message)).not.toContain('holder-ok-2');
  });
});
