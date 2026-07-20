import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { ICatalogRepository } from './repositories/i-catalog.repository';
import { withTimeout } from '../common/utils/with-timeout.util';

@Injectable()
export class CatalogUseCase {
  private readonly logger = new Logger(CatalogUseCase.name);

  /**
   * Upper bound on each catalog cache round-trip (version read/write, entry
   * read/write). Same rationale as AuthService.CACHE_TIMEOUT_MS /
   * TenantsService.CACHE_TIMEOUT_MS: this Cache is a Keyv/KeyvRedis client
   * with no command timeout of its own, and getCourses/getCourseTopics sit on
   * a request path — a hung Redis must degrade to the uncached repository
   * lookup instead of hanging the request. Configurable so an operator can
   * widen it without a redeploy.
   */
  private static readonly CACHE_TIMEOUT_MS = ((): number => {
    const parsed = Number(process.env.CATALOG_CACHE_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  })();

  constructor(
    @Inject(ICatalogRepository)
    private readonly catalogRepository: ICatalogRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly cls: ClsService,
  ) {}

  private tenantId(): string {
    return this.cls.get('tenantSchema') || 'public';
  }

  /**
   * Returns the current cache-namespace version for a tenant.
   *
   * WHY VERSIONED KEYS
   * ------------------
   * Cache keys are scoped per search term (`...:${search || 'all'}`), so a
   * tenant has an unbounded number of live keys. Invalidation used to delete
   * only the `:all` variants, which meant toggling a topic's visibility and
   * then searching still showed the pre-toggle counts for the full TTL.
   * Enumerating every variant is not an option — the store is Redis and
   * key-scanning is both racy and O(keyspace). Stamping the version INTO the
   * key makes every variant unreachable at once with a single write, and works
   * identically across replicas.
   *
   * WHY A TIMESTAMP AND NOT A COUNTER
   * ---------------------------------
   * The version itself lives in the cache, so it can be evicted. A counter
   * would restart at 1 and resurrect stale entries written under the old
   * version 1. `Date.now()` is monotonic across evictions and restarts: a new
   * version is always greater than every version ever used before, so orphaned
   * entries can never be read again — they simply age out.
   */
  private async getCacheVersion(tenantId: string): Promise<number> {
    // Bounded and best-effort, like AuthService/TenantsService's cache reads:
    // a hung or broken Redis must degrade this to version 0 (the same value
    // an ordinary cache miss already returns below) rather than hang the
    // request or throw.
    try {
      const version = await withTimeout(
        () => this.cacheManager.get<number>(`catalogs:version:${tenantId}`),
        'catalog cache version read',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
      return version ?? 0;
    } catch (error) {
      this.logger.warn(
        `Catalog cache version read bypassed for tenant ${tenantId}, using version 0: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return 0;
    }
  }

  /** Bumps a single tenant's cache-namespace version. See getCacheVersion. */
  private async bumpCacheVersion(tenantId: string): Promise<void> {
    try {
      await withTimeout(
        () =>
          this.cacheManager.set(
            `catalogs:version:${tenantId}`,
            Date.now(),
            // ttl 0 == never expires (Keyv maps 0 to undefined). The version
            // must outlive the entries it guards; if the store drops it
            // anyway, the timestamp scheme keeps that safe (see
            // getCacheVersion).
            0,
          ),
        'catalog cache version write',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog cache version write bypassed for tenant ${tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Bumps the cache-namespace version for every given tenant schema.
   *
   * WHY PER-TENANT, EVEN THOUGH THE SYNC ITSELF IS GLOBAL
   * -------------------------------------------------------
   * `CatalogCronService`'s hourly sync writes only public.courses/topics/
   * subtopics — data shared by every tenant, with no tenant in scope. But
   * `getCourses`/`getCourseTopics` join that data against
   * `tenant_topic_visibility`, which lives in EACH TENANT'S OWN schema (see
   * `TenantService.runInTenant`) and is genuinely tenant-scoped: two tenants
   * can hide different topics, so the SAME course can render with different
   * `activeTopicsCount` per tenant. The cached RESULT is therefore per-tenant
   * even though the underlying course/topic rows are not — so invalidation
   * has to walk every active tenant's version key rather than collapse to one
   * global key (which would be wrong: it would invalidate the correctly
   * cached per-tenant visibility on every sync, not just the shared data).
   *
   * Called by `CatalogCronService` after a successful sync so a renamed or
   * added course is visible immediately, instead of only after the existing
   * cache entries' TTL (10 min) expires.
   */
  async invalidateCacheForTenants(tenantSchemas: string[]): Promise<void> {
    await Promise.all(
      tenantSchemas.map((schema) => this.bumpCacheVersion(schema)),
    );
  }

  /**
   * Retorna los catálogos listos para ser mostrados en la UI.
   * Internamente hace el JOIN con la tabla de visibilidad.
   */
  async getCourses(search?: string): Promise<any> {
    const tenantId = this.tenantId();
    const version = await this.getCacheVersion(tenantId);
    const cacheKey = `catalogs:${version}:courses:${tenantId}:${search || 'all'}`;

    // Bounded and best-effort: a hung or broken Redis must degrade to the
    // uncached repository lookup below, not hang this request.
    let cached: any;
    try {
      cached = await withTimeout(
        () => this.cacheManager.get<any>(cacheKey),
        'catalog courses cache read',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog courses cache read bypassed for tenant ${tenantId}, querying the repository: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      cached = undefined;
    }
    if (cached) return cached;

    const courses = await this.catalogRepository.getCourses(search);

    // Read from the durable sync-state table, not from a cache entry: the
    // freshness signal has to outlive both the cache TTL and a restart.
    const syncState = await this.catalogRepository.getSyncState();
    const lastSuccessAt = syncState?.lastSuccessAt
      ? new Date(syncState.lastSuccessAt).toISOString()
      : null;

    const result = {
      courses: courses.map((course: any) => ({
        id: course.id,
        name: course.name,
        topicsCount: parseInt(course.topics_count, 10) || 0,
        activeTopicsCount: parseInt(course.active_topics_count, 10) || 0,
      })),
      lastSyncedAt: lastSuccessAt,
      // Surfaced so a silently failing sync is visible in the UI rather than
      // only inferable from a `lastSyncedAt` that quietly stops advancing.
      syncStatus: syncState
        ? {
            lastAttemptAt: syncState.lastAttemptAt
              ? new Date(syncState.lastAttemptAt).toISOString()
              : null,
            lastOutcome: syncState.lastOutcome,
            lastError: syncState.lastError,
          }
        : null,
    };

    try {
      await withTimeout(
        () => this.cacheManager.set(cacheKey, result),
        'catalog courses cache write',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog courses cache write bypassed for tenant ${tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    return result;
  }

  async getCourseTopics(courseId: string, search?: string): Promise<any[]> {
    const tenantId = this.tenantId();
    const version = await this.getCacheVersion(tenantId);
    const cacheKey = `catalogs:${version}:topics:${tenantId}:${courseId}:${search || 'all'}`;

    // Bounded and best-effort — same convention as getCourses above.
    let cached: any[] | undefined;
    try {
      cached = await withTimeout(
        () => this.cacheManager.get<any[]>(cacheKey),
        'catalog course topics cache read',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog course topics cache read bypassed for tenant ${tenantId}, querying the repository: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      cached = undefined;
    }
    if (cached) return cached;

    const topics = await this.catalogRepository.getCourseTopics(
      courseId,
      search,
    );

    try {
      await withTimeout(
        () => this.cacheManager.set(cacheKey, topics),
        'catalog course topics cache write',
        CatalogUseCase.CACHE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog course topics cache write bypassed for tenant ${tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    return topics;
  }

  /**
   * Actualiza la visibilidad de un Topic insertando en la tabla tenant
   */
  async updateTopicVisibility(
    topicId: string,
    isActive: boolean,
  ): Promise<void> {
    // Reject an unknown topic with a 404 instead of letting the visibility
    // upsert hit the FK and surface as a 500. The existence check runs in the
    // same request tenant context as the upsert below.
    const courseId =
      await this.catalogRepository.findCourseIdByTopicId(topicId);
    if (courseId === null) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    await this.catalogRepository.updateTopicLocalVisibility(topicId, isActive);

    // A single write retires EVERY cached variant for this tenant — course
    // lists, topic lists, and all of their search-scoped permutations.
    await this.bumpCacheVersion(this.tenantId());
  }
}
