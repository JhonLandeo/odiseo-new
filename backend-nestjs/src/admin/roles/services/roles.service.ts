import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { TenantService } from '../../../database/tenant.service';

@Injectable()
export class RolesService {
  // Roles live in the per-tenant schema, so every operation must run inside the
  // tenant transaction (via TenantService). A plain default-connection
  // repository would target the public schema, where the roles table does not
  // exist.
  constructor(private readonly tenantService: TenantService) {}

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
    return this.tenantService.runInTenant(async (manager) => {
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

      return repo.save(role);
    });
  }

  async remove(id: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      const repo = manager.getRepository(Role);
      const role = await this.findOneWith(manager, id);

      if (role.isSystemDefault) {
        throw new ConflictException('Cannot delete a system default role');
      }

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
    });
  }
}
