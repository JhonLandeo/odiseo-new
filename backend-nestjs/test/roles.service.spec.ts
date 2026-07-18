import { Test, TestingModule } from '@nestjs/testing';
import { RolesResolverService } from '../src/admin/roles/services/roles-resolver.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from '../src/admin/roles/entities/role.entity';
import { UserRole } from '../src/admin/roles/entities/user-role.entity';
import { Repository } from 'typeorm';

describe('RolesResolverService', () => {
  let service: RolesResolverService;
  let roleRepo: Repository<Role>;
  let userRoleRepo: Repository<UserRole>;

  const mockRole1 = {
    id: 'role-1',
    name: 'Docente',
    permissions: ['VIEW_SYLLABUS'],
    inheritedRoles: [],
  };

  const mockRole2 = {
    id: 'role-2',
    name: 'Coordinador',
    permissions: ['EDIT_SYLLABUS'],
    inheritedRoles: [mockRole1],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesResolverService,
        {
          provide: getRepositoryToken(Role),
          useValue: {
            find: jest.fn().mockResolvedValue([mockRole1, mockRole2]),
          },
        },
        {
          provide: getRepositoryToken(UserRole),
          useValue: {
            find: jest
              .fn()
              .mockResolvedValue([{ userId: 'user-1', roleId: 'role-2' }]),
          },
        },
      ],
    }).compile();

    service = module.get<RolesResolverService>(RolesResolverService);
    roleRepo = module.get<Repository<Role>>(getRepositoryToken(Role));
    userRoleRepo = module.get<Repository<UserRole>>(
      getRepositoryToken(UserRole),
    );
  });

  it('should flatten permissions taking inheritance into account', async () => {
    const permissions = await service.getFlattenedPermissionsForUser('user-1');

    // User is Coordinador, so they should get EDIT_SYLLABUS
    // Coordinador inherits from Docente, so they should ALSO get VIEW_SYLLABUS
    expect(permissions.length).toBe(2);
    expect(permissions).toContain('EDIT_SYLLABUS');
    expect(permissions).toContain('VIEW_SYLLABUS');
  });

  it('should handle cyclical inheritance gracefully', async () => {
    const cyclicRole1: any = {
      id: 'cyclic-1',
      permissions: ['PERM_1'],
      inheritedRoles: [],
    };
    const cyclicRole2: any = {
      id: 'cyclic-2',
      permissions: ['PERM_2'],
      inheritedRoles: [cyclicRole1],
    };
    cyclicRole1.inheritedRoles.push(cyclicRole2);

    jest
      .spyOn(roleRepo, 'find')
      .mockResolvedValueOnce([cyclicRole1, cyclicRole2]);
    jest
      .spyOn(userRoleRepo, 'find')
      .mockResolvedValueOnce([{ userId: 'user-1', roleId: 'cyclic-2' }] as any);

    const permissions = await service.getFlattenedPermissionsForUser('user-1');

    expect(permissions.length).toBe(2);
    expect(permissions).toContain('PERM_1');
    expect(permissions).toContain('PERM_2');
  });
});
