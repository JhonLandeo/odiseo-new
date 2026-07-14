import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
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
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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
        // Step 6: Load roles and permissions using the new TypeORM schema
        const userRolesResult = await manager.query(
          `
          SELECT r.id, r.name, r.permissions 
          FROM roles r
          INNER JOIN user_roles ur ON ur.role_id = r.id
          WHERE ur.user_id = $1
          `,
          [user.id],
        );

        const mergedPermissions = Array.from(
          new Set(userRolesResult.flatMap((r: any) => r.permissions || []))
        ) as string[];

        return {
          user,
          roles: userRolesResult.map((r: any) => r.name),
          permissions: mergedPermissions,
          companyId: company.id,
        };
      },
    );

    return result;
  }

  /**
   * Generates a JWT token with minimal user claims.
   * We exclude permissions to prevent HTTP Header Bloat (431 error).
   */
  generateToken(payload: {
    sub: string;
    companyId: string;
    roles: string[];
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
  }) {
    const schemaName = `tenant_${payload.companyId}`;

    const result = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: payload.sub, isActive: true },
        });

        if (!user) return null;

        const rolesResult = await manager.query(
          `
          SELECT r.permissions
          FROM roles r
          INNER JOIN user_roles ur ON ur.role_id = r.id
          WHERE ur.user_id = $1
          `,
          [user.id]
        );

        const mergedPermissions = Array.from(
          new Set(rolesResult.flatMap((r: any) => r.permissions || []))
        ) as string[];

        return {
          user,
          permissions: mergedPermissions
        };
      },
    );

    if (!result || !result.user) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      companyId: payload.companyId,
      roles: payload.roles,
      permissions: result.permissions,
    };
  }

  /**
   * Dynamically loads permissions for a user. Used by Guards.
   */
  async getUserPermissions(userId: string, companyId: string): Promise<string[]> {
    const cacheKey = `auth:permissions:${companyId}:${userId}`;
    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    const schemaName = `tenant_${companyId}`;
    const permissions = await this.tenantService.runInSchema(schemaName, async (manager) => {
      const rolesResult = await manager.query(
        `
        SELECT r.permissions
        FROM roles r
        INNER JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = $1
        `,
        [userId]
      );
      return Array.from(
        new Set(rolesResult.flatMap((r: any) => r.permissions || []))
      ) as string[];
    });

    await this.cacheManager.set(cacheKey, permissions);
    return permissions;
  }
}
