import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RolesService } from './roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { PERMISSIONS } from '../constants/permissions.constant';

const COMPANY_ID = 'company-1';
const ACTOR_ID = 'actor-1';

function createService(actorPermissions: string[], companyId: any = COMPANY_ID) {
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
    invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const cls = { get: jest.fn().mockReturnValue(companyId) };

  const service = new RolesService(
    tenantService as any,
    authService as any,
    cls as any,
  );
  return { service, repo, tenantService, authService, cls };
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

    await service.update('role-1', { name: 'Renamed' } as UpdateRoleDto, ACTOR_ID);

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
