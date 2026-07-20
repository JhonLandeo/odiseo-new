import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
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
  private readonly logger = new Logger(AuthService.name);

  /**
   * Upper bound on each permission-cache round-trip (read and write).
   *
   * The cache is a Keyv/KeyvRedis client with no command timeout, and
   * getUserAuthState runs inside JwtAuthGuard on EVERY authenticated request. A
   * hung Redis (not one that refuses — one that accepts the socket and never
   * answers) would otherwise hang the whole authenticated API. This is a
   * per-request hot path, so the bound is small; Postgres is the source of
   * truth, so tripping it degrades to an uncached DB lookup, never a failure.
   * Configurable so an operator can widen it for a slow-but-alive cache without
   * a redeploy.
   */
  private static readonly CACHE_TIMEOUT_MS = ((): number => {
    const parsed = Number(process.env.AUTH_STATE_CACHE_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  })();

  /**
   * TTL for the per-process local cache tier consulted below, between a Redis
   * miss/error and the Postgres fallback. Deliberately SHORT — far shorter
   * than the 60s Redis TTL — because this tier is a stampede-damper, not a
   * source of truth: its only job is to stop many near-simultaneous requests
   * for the SAME (userId, companyId) from each opening their own
   * runInSchema transaction, whether that burst comes from a sustained Redis
   * outage (many requests for the same hot users, none of which can reach
   * Redis at all) or an ordinary cache-miss stampede (a newly-logged-in
   * user's first few requests arriving before that first request's Redis
   * write has landed). A few seconds is long enough to absorb such a burst,
   * short enough that a permission change reaches this process quickly even
   * on the rare path that misses invalidateUserPermissions()'s explicit
   * Map.delete below and has to wait out the TTL instead.
   */
  private static readonly LOCAL_CACHE_TTL_MS = 4000;

  /**
   * Hard cap on the local cache's entry count — a safety net against
   * unbounded memory growth, not a performance target. A few thousand covers
   * the working set of concurrently active users on one process comfortably.
   * Eviction is oldest-inserted-first: a plain Map preserves insertion order,
   * so `map.keys().next().value` is the oldest key with no extra bookkeeping.
   * That is a simple, correct-enough policy for a multi-second TTL cache; a
   * full LRU would track access recency this cache has no use for.
   */
  private static readonly LOCAL_CACHE_MAX_ENTRIES = 5000;

  /**
   * Per-process fallback tier for getUserAuthState, keyed identically to the
   * Redis cache. See LOCAL_CACHE_TTL_MS for why it exists and how long an
   * entry lives.
   */
  private readonly localAuthStateCache = new Map<
    string,
    {
      state: { permissions: string[]; forcePasswordReset: boolean };
      expiresAt: number;
    }
  >();

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
    // Step 1: Resolve company from subdomain.
    // findBySubdomain already filters isActive: true, so an inactive company
    // resolves to null and is rejected as "invalid credentials" — the same
    // outcome TenantMiddleware produces by querying with isActive: true.
    const company = await this.tenantsService.findBySubdomain(subdomain);
    if (!company) {
      return null;
    }

    // Login is @Public() and takes the subdomain from the body, so it bypasses
    // TenantMiddleware entirely. Mirror the middleware's subscription check
    // here (same exception, same message) or a user of a SUSPENDED company
    // could still mint a 24h JWT. GRACE_PERIOD stays allowed, exactly as in
    // the middleware. Checked before credentials on purpose: the subdomain
    // alone identifies the company, so this reveals nothing about the email or
    // password — and the middleware already exposes the suspended state on
    // every other route.
    if (company.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `The company '${subdomain}' is currently suspended. Please contact support.`,
      );
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

    // The cache read is bounded and best-effort: on timeout or any cache error
    // we treat it as a MISS and fall through to the Postgres computation below.
    // The cache is only an optimization — Postgres is the source of truth — so a
    // hung or broken Redis must degrade this hot path to a slower DB-computed
    // lookup, keeping the authenticated API up rather than hanging it.
    let cached:
      { permissions: string[]; forcePasswordReset: boolean } | null | undefined;
    try {
      cached = await this.withCacheTimeout(
        () =>
          this.cacheManager.get<{
            permissions: string[];
            forcePasswordReset: boolean;
          }>(cacheKey),
        'permission cache read',
      );
    } catch (error) {
      // One warn per bypass: enough to surface a Redis problem, not so much that
      // a sustained outage drowns the logs. Ids only, never the cached value.
      this.logger.warn(
        `Permission cache read bypassed for user ${userId} in company ${companyId}, computing from database: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      cached = undefined;
    }
    if (cached) return cached;

    // Second fallback tier, consulted only after a Redis MISS or error and
    // before opening a Postgres transaction. This is what actually damps
    // repeated identical runInSchema calls for the same (userId, companyId)
    // under a Redis outage or a cache-miss stampede — see LOCAL_CACHE_TTL_MS.
    // TenantService.runInSchema's transaction/SET LOCAL search_path mechanics
    // are deliberately untouched by this change: SET LOCAL only scopes to the
    // current transaction, so avoiding the transaction wrapper would either
    // error or (with plain SET) leak the search_path to other queries sharing
    // the pooled connection afterward — a cross-tenant correctness bug. This
    // tier reduces how OFTEN that transaction opens, not how it works.
    const localHit = this.getLocalAuthState(cacheKey);
    if (localHit) return localHit;

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
    //
    // Best-effort and bounded, like the read: a slow or broken Redis write must
    // never hang or fail a request that already has its answer from Postgres.
    // The next request simply misses the cache and recomputes.
    try {
      await this.withCacheTimeout(
        () => this.cacheManager.set(cacheKey, state, 60 * 1000),
        'permission cache write',
      );
    } catch (error) {
      this.logger.warn(
        `Permission cache write bypassed for user ${userId} in company ${companyId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    // Populated alongside the Redis write, independent of whether that write
    // succeeded: this tier's job is damping repeated Postgres round-trips
    // within this process, which matters MOST exactly when Redis is the one
    // failing.
    this.setLocalAuthState(cacheKey, state);

    return state;
  }

  /**
   * Reads the local fallback tier, evicting and ignoring an expired entry as
   * if it were a miss.
   */
  private getLocalAuthState(
    cacheKey: string,
  ): { permissions: string[]; forcePasswordReset: boolean } | undefined {
    const entry = this.localAuthStateCache.get(cacheKey);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.localAuthStateCache.delete(cacheKey);
      return undefined;
    }
    return entry.state;
  }

  /**
   * Writes the local fallback tier, evicting the oldest entry first when at
   * capacity (see LOCAL_CACHE_MAX_ENTRIES). Updating an already-present key
   * does not grow the Map, so no eviction runs in that case.
   */
  private setLocalAuthState(
    cacheKey: string,
    state: { permissions: string[]; forcePasswordReset: boolean },
  ): void {
    if (
      !this.localAuthStateCache.has(cacheKey) &&
      this.localAuthStateCache.size >= AuthService.LOCAL_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = this.localAuthStateCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.localAuthStateCache.delete(oldestKey);
      }
    }
    this.localAuthStateCache.set(cacheKey, {
      state,
      expiresAt: Date.now() + AuthService.LOCAL_CACHE_TTL_MS,
    });
  }

  /**
   * Races a cache operation against a timer so a hung Redis client cannot stall
   * the caller. Rejects on timeout; the callers above catch that and any cache
   * error and fall back to Postgres. The timer is always cleared in the finally,
   * so a settled operation never leaves a pending handle on the event loop.
   */
  private async withCacheTimeout<T>(
    operation: () => Promise<T>,
    label: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${AuthService.CACHE_TIMEOUT_MS}ms`,
            ),
          ),
        AuthService.CACHE_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      clearTimeout(timer);
    }
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
   * Wired into every mutation that changes a user's authority or hold state:
   * RolesService.update/remove (which fan out to every holder of the role),
   * user-role assignment, tenant-admin password/deactivation flows and the
   * platform credentials reset. The cache is Redis-backed, so the delete
   * reaches every instance.
   *
   * Best-effort and bounded, like every other cache access here: callers run
   * AFTER their database write has committed, so a Redis failure must degrade
   * to "stale until the 60s TTL expires" — never to an error on a mutation
   * that already succeeded.
   */
  async invalidateUserPermissions(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const cacheKey = `auth:permissions:${companyId}:${userId}`;
    // Cleared synchronously and unconditionally, unlike the best-effort Redis
    // delete below: this is an in-process Map with no I/O to fail, so there is
    // no reason for a permission change to wait out LOCAL_CACHE_TTL_MS in
    // THIS process when clearing it costs nothing.
    this.localAuthStateCache.delete(cacheKey);

    try {
      await this.withCacheTimeout(
        () => this.cacheManager.del(cacheKey),
        'permission cache invalidation',
      );
    } catch (error) {
      this.logger.warn(
        `Permission cache invalidation bypassed for user ${userId} in company ${companyId}; stale entry expires with the TTL: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
