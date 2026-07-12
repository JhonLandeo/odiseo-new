import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';
import { TenantsService } from '../tenants/tenants.service';
import { JwtService } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validates user credentials against the tenant's database.
   * Steps:
   * 1. Resolve company from subdomain
   * 2. Set search_path to tenant schema
   * 3. Find user by email in tenant schema
   * 4. Validate password with bcrypt
   * 5. Assert user.company_id === tenant.company_id (cross-tenant isolation)
   * 6. Load roles and permissions
   */
  async validateUser(
    email: string,
    password: string,
    subdomain: string,
  ): Promise<{
    user: User;
    roles: string[];
    permissions: string[];
    companyId: string;
  } | null> {
    // Step 1: Resolve company from subdomain
    const company = await this.tenantsService.findBySubdomain(subdomain);
    if (!company) {
      return null;
    }

    const schemaName = `tenant_${company.id}`;

    // Step 2-3: Find user in tenant schema
    const result = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        const user = await manager.findOne(User, {
          where: { email, isActive: true },
        });
        if (!user) return null;

        // Step 4: Validate password
        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        // Step 5: Cross-tenant isolation check
        if (user.companyId !== company.id) return null;

        // Step 6: Load roles and permissions
        // Step 6: Load roles and permissions using new RBAC
        const userRolesResult = await manager.query(
          `
        SELECT r.id, r.name, r.permissions FROM roles r
        INNER JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = $1
      `,
          [user.id],
        );

        const allRolesInheritance = await manager.query(
          `
        SELECT r.id, r.permissions, ri.parent_role_id
        FROM roles r
        LEFT JOIN role_inheritance ri ON ri.child_role_id = r.id
      `
        );

        const permissionsSet = new Set<string>();
        const visitedRoleIds = new Set<string>();

        const resolveRolePermissions = (currentRoleId: string) => {
          if (visitedRoleIds.has(currentRoleId)) return;
          visitedRoleIds.add(currentRoleId);

          // Find role data
          const roleData = allRolesInheritance.filter((r: any) => r.id === currentRoleId);
          if (!roleData.length) return;

          const permissionsJson = roleData[0].permissions;
          if (permissionsJson && Array.isArray(permissionsJson)) {
            permissionsJson.forEach((p: string) => permissionsSet.add(p));
          }

          // Recursively resolve parents
          roleData.forEach((r: any) => {
            if (r.parent_role_id) {
              resolveRolePermissions(r.parent_role_id);
            }
          });
        };

        userRolesResult.forEach((ur: any) => resolveRolePermissions(ur.id));

        return {
          user,
          roles: userRolesResult.map((r: any) => r.name),
          permissions: Array.from(permissionsSet),
          companyId: company.id,
        };
      },
    );

    return result;
  }

  /**
   * Generates a JWT token with user claims.
   */
  generateToken(payload: {
    sub: string;
    companyId: string;
    roles: string[];
    permissions: string[];
  }): string {
    return this.jwtService.sign(payload);
  }

  /**
   * Verifies a JWT token and returns the decoded payload.
   */
  verifyToken(token: string): any {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token expired or invalid');
    }
  }

  /**
   * Gets user data from a valid JWT payload (for /auth/me).
   */
  async getUserFromToken(payload: {
    sub: string;
    companyId: string;
    roles: string[];
    permissions: string[];
  }) {
    const schemaName = `tenant_${payload.companyId}`;

    const user = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        return manager.findOne(User, {
          where: { id: payload.sub, isActive: true },
        });
      },
    );

    if (!user) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      companyId: payload.companyId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
