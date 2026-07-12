import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../entities/user-role.entity';
import { Role } from '../entities/role.entity';

@Injectable()
export class RolesResolverService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  /**
   * Calculates the flattened list of all unique permissions a user has,
   * taking into account all their assigned roles and any roles those inherit from.
   */
  async getFlattenedPermissionsForUser(userId: string): Promise<string[]> {
    const userRoles = await this.userRoleRepository.find({ where: { userId } });
    if (!userRoles.length) return [];

    const roleIds = userRoles.map(ur => ur.roleId);
    
    // Fetch all roles with their inherited roles
    const allRoles = await this.roleRepository.find({ relations: ['inheritedRoles'] });
    
    const permissionsSet = new Set<string>();
    const visitedRoleIds = new Set<string>();

    const resolveRolePermissions = (currentRoleId: string) => {
      if (visitedRoleIds.has(currentRoleId)) return; // Prevent cyclic inheritance issues
      visitedRoleIds.add(currentRoleId);

      const role = allRoles.find(r => r.id === currentRoleId);
      if (!role) return;

      // Add direct permissions
      role.permissions?.forEach(p => permissionsSet.add(p));

      // Recursively add inherited permissions
      role.inheritedRoles?.forEach(inherited => {
        resolveRolePermissions(inherited.id);
      });
    };

    // Start resolution from directly assigned roles
    roleIds.forEach(id => resolveRolePermissions(id));

    return Array.from(permissionsSet);
  }
}
