import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.rolesRepository.find({ relations: ['inheritedRoles'] });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.rolesRepository.findOne({ where: { id }, relations: ['inheritedRoles'] });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    const { inheritedRoleIds, ...roleData } = createRoleDto;
    
    const role = this.rolesRepository.create(roleData);
    
    if (inheritedRoleIds && inheritedRoleIds.length > 0) {
      role.inheritedRoles = await this.rolesRepository.findBy({ id: In(inheritedRoleIds) });
    }

    return this.rolesRepository.save(role);
  }

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);
    
    if (role.isSystemDefault && updateRoleDto.name) {
      // Typically prevent changing core properties of system defaults
      throw new ConflictException('Cannot rename a system default role');
    }

    const { inheritedRoleIds, ...roleData } = updateRoleDto;

    Object.assign(role, roleData);

    if (inheritedRoleIds !== undefined) {
      if (inheritedRoleIds.includes(id)) {
        throw new ConflictException('A role cannot inherit from itself');
      }
      role.inheritedRoles = await this.rolesRepository.findBy({ id: In(inheritedRoleIds) });
    }

    return this.rolesRepository.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    
    if (role.isSystemDefault) {
      throw new ConflictException('Cannot delete a system default role');
    }
    
    // Deletion prevention logic for assigned users and inheriting roles will be handled by DB foreign keys (RESTRICT).
    // The query will throw an error if constraints fail, which we can catch in a global filter or here.
    try {
      await this.rolesRepository.delete(id);
    } catch (error) {
      if (error.code === '23503') { // PostgreSQL foreign key violation
        throw new ConflictException('Cannot delete role because it is assigned to users or inherited by other roles');
      }
      throw error;
    }
  }
}
