import { Injectable } from '@nestjs/common';
import { UserRole } from '../entities/user-role.entity';
import { Role } from '../entities/role.entity';
import { TenantService } from '../../../database/tenant.service';

@Injectable()
export class RolesResolverService {
  // Roles/user_roles live in the per-tenant schema; resolve inside the tenant
  // transaction rather than against the default (public) connection.
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Calculates the flattened list of all unique permissions a user has,
   * taking into account all their assigned roles and any roles those inherit from.
   */
  async getFlattenedPermissionsForUser(userId: string): Promise<string[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const userRoles = await manager
        .getRepository(UserRole)
        .find({ where: { userId } });
      if (!userRoles.length) return [];

      const roleIds = userRoles.map((ur) => ur.roleId);

      // Fetch all roles with their inherited roles
      const allRoles = await manager
        .getRepository(Role)
        .find({ relations: ['inheritedRoles'] });

      const permissionsSet = new Set<string>();
      const visitedRoleIds = new Set<string>();

      const resolveRolePermissions = (currentRoleId: string) => {
        if (visitedRoleIds.has(currentRoleId)) return; // Prevent cyclic inheritance issues
        visitedRoleIds.add(currentRoleId);

        const role = allRoles.find((r) => r.id === currentRoleId);
        if (!role) return;

        role.permissions?.forEach((p) => permissionsSet.add(p));
        role.inheritedRoles?.forEach((inherited) => {
          resolveRolePermissions(inherited.id);
        });
      };

      roleIds.forEach((id) => resolveRolePermissions(id));

      return Array.from(permissionsSet);
    });
  }
}
