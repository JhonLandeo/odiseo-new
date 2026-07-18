import { Injectable } from '@nestjs/common';
import { TenantService } from '../../../database/tenant.service';
import {
  findEffectivePermissions,
  findEffectivePermissionsForRoleIds,
} from '../permissions/flattened-permissions.query';

@Injectable()
export class RolesResolverService {
  // Roles/user_roles live in the per-tenant schema; resolve inside the tenant
  // transaction rather than against the default (public) connection.
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Calculates the flattened list of all unique permissions a user has,
   * taking into account all their assigned roles and any roles those inherit from.
   *
   * Thin wrapper over the shared recursive-CTE traversal: this service resolves
   * against the AMBIENT tenant (CLS), whereas AuthService resolves against an
   * explicit schema derived from the JWT. Same traversal, same cycle-safety,
   * one implementation — see flattened-permissions.query.ts.
   */
  async getFlattenedPermissionsForUser(userId: string): Promise<string[]> {
    return this.tenantService.runInTenant((manager) =>
      findEffectivePermissions(manager, userId),
    );
  }

  /**
   * Effective permissions a SET OF ROLES would confer if attached — the roles'
   * own permissions plus everything they inherit, transitively. Resolves
   * against the ambient tenant (CLS).
   *
   * The grant-boundary check reads this to answer "would attaching these roles
   * (as inheritance on a role, or as an assignment on a user) hand out any
   * permission the actor does not already hold?". Same cycle-safe traversal as
   * the user-seeded resolver — see flattened-permissions.query.ts.
   */
  async getEffectivePermissionsForRoleIds(
    roleIds: string[],
  ): Promise<string[]> {
    if (roleIds.length === 0) return [];
    return this.tenantService.runInTenant((manager) =>
      findEffectivePermissionsForRoleIds(manager, roleIds),
    );
  }
}
