import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { TenantService } from '../database/tenant.service';
import { TenantsService } from '../tenants/tenants.service';
import { JwtService } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import {
  findEffectiveRoles,
  findEffectivePermissions,
  flattenPermissions,
} from '../admin/roles/permissions/flattened-permissions.query';
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

        // Step 6: Load effective roles and permissions.
        // Resolves the inheritance hierarchy, not just the direct assignments,
        // so the token and the login response describe the same authority the
        // guards will actually enforce.
        const effectiveRoles = await findEffectiveRoles(manager, user.id);

        return {
          user,
          roles: effectiveRoles.map((r) => r.name),
          permissions: flattenPermissions(effectiveRoles),
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

        return {
          user,
          permissions: await findEffectivePermissions(manager, user.id),
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
      // Exposed so a client can discover the locked state up front instead of
      // learning it from a failed request to some unrelated endpoint.
      forcePasswordReset: result.user.forcePasswordReset,
    };
  }

  /**
   * Per-request authorization state for a user: what they may do, and whether
   * they may do anything at all yet.
   *
   * force_password_reset rides along in this single cached lookup rather than
   * in the JWT deliberately. A token claim is frozen at login, so an operator
   * resetting an administrator's password could not take effect until the
   * token expired, and conversely a user who had just changed their password
   * would stay locked out holding a token that still said otherwise. Reading it
   * here keeps it as fresh as the permissions the guards already trust.
   */
  async getUserAuthState(
    userId: string,
    companyId: string,
  ): Promise<{ permissions: string[]; forcePasswordReset: boolean }> {
    const cacheKey = `auth:permissions:${companyId}:${userId}`;
    const cached = await this.cacheManager.get<{
      permissions: string[];
      forcePasswordReset: boolean;
    }>(cacheKey);
    if (cached) return cached;

    const schemaName = `tenant_${companyId}`;
    // Resolves the full role hierarchy: a role's permissions include everything
    // it inherits, transitively. See flattened-permissions.query.ts for why the
    // traversal lives in SQL and how it stays cycle-safe.
    const state = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        const [permissions, user] = await Promise.all([
          findEffectivePermissions(manager, userId),
          manager.findOne(User, { where: { id: userId } }),
        ]);
        return {
          permissions,
          // Absent user: the token outlived the account. Deny nothing here —
          // that is JwtAuthGuard's and getUserFromToken's call, not ours.
          forcePasswordReset: user?.forcePasswordReset ?? false,
        };
      },
    );

    // Role/permission mutations call invalidateUserPermissions() explicitly, so
    // changes normally propagate on the next request. The short TTL is the
    // backstop for anything that bypasses those paths (direct SQL, a failed
    // cache delete): worst case, stale permissions live at most 60s.
    await this.cacheManager.set(cacheKey, state, 60 * 1000);
    return state;
  }

  /**
   * Dynamically loads permissions for a user. Used by Guards.
   */
  async getUserPermissions(
    userId: string,
    companyId: string,
  ): Promise<string[]> {
    return (await this.getUserAuthState(userId, companyId)).permissions;
  }

  /**
   * AC-016: lets a user replace a password that was chosen for them.
   *
   * Requires the current password even though the caller already holds a valid
   * session. A session cookie is a weaker credential than the password itself —
   * it can be stolen — and without this check anyone holding one could lock the
   * real owner out permanently.
   */
  async changePassword(
    userId: string,
    companyId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const schemaName = `tenant_${companyId}`;

    await this.tenantService.runInSchema(schemaName, async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId, isActive: true },
      });
      if (!user) {
        throw new UnauthorizedException('User not found or deactivated');
      }

      const currentValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );
      if (!currentValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Compared against the stored hash rather than against the plaintext the
      // caller just sent, so a re-submission that differs only in a way bcrypt
      // ignores still counts as the same password.
      const isSamePassword = await bcrypt.compare(
        newPassword,
        user.passwordHash,
      );
      if (isSamePassword) {
        throw new BadRequestException(
          'The new password must be different from the current one',
        );
      }

      await manager.update(
        User,
        { id: userId },
        {
          passwordHash: await bcrypt.hash(newPassword, 10),
          forcePasswordReset: false,
        },
      );
    });

    // The flag is served from the same 60s cache the guards read, so without
    // this the user would stay locked out of every route for up to a minute
    // after successfully changing their password.
    await this.invalidateUserPermissions(companyId, userId);
  }

  /**
   * Invalidates the cached permissions for a specific user, forcing the next
   * request to reload them from the database.
   *
   * Wired into every role/permission mutation flow: RolesService.update/remove
   * (which fans out to every holder of the role) and UserRolesController
   * assignment. The cache is Redis-backed, so the delete reaches every instance.
   */
  async invalidateUserPermissions(
    companyId: string,
    userId: string,
  ): Promise<void> {
    await this.cacheManager.del(`auth:permissions:${companyId}:${userId}`);
  }
}
