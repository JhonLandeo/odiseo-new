import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Company } from './entities/tenant.entity';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  /**
   * Lifetime of a cached subdomain -> company row.
   *
   * findBySubdomain backs TenantMiddleware, so it runs once per request; the
   * cache exists to keep that lookup off Postgres. The TTL is deliberately
   * short because it is also the worst-case delay for anything that bypasses
   * the explicit invalidation below — most importantly a SUSPENDED company,
   * which must stop resolving within this window even if the cache delete on
   * suspension failed.
   */
  private static readonly CACHE_TTL_MS = ((): number => {
    const parsed = Number(process.env.COMPANY_LOOKUP_CACHE_TTL_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  })();

  /**
   * Upper bound on each cache round-trip. Same rationale as the auth-state
   * cache in AuthService: this sits on the per-request hot path over a Keyv
   * client with no command timeout, so a hung Redis must degrade to the DB
   * lookup instead of hanging every request behind tenant resolution.
   */
  private static readonly CACHE_TIMEOUT_MS = ((): number => {
    const parsed = Number(process.env.COMPANY_LOOKUP_CACHE_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  })();

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Find a company by subdomain. Returns null if not found.
   *
   * Cached in Redis under a short TTL: TenantMiddleware calls this on EVERY
   * tenant-scoped request, and the row changes only through the platform admin
   * endpoints, which invalidate explicitly (see invalidateSubdomainCache).
   * Misses — including unknown subdomains — always hit the database; negative
   * results are deliberately not cached so a freshly provisioned subdomain
   * resolves immediately. Any cache failure falls through to Postgres, which
   * remains the source of truth.
   */
  async findBySubdomain(subdomain: string): Promise<Company | null> {
    const cacheKey = this.subdomainCacheKey(subdomain);

    let cached: Company | null | undefined;
    try {
      cached = await this.withCacheTimeout(
        () => this.cacheManager.get<Company>(cacheKey),
        'company lookup cache read',
      );
    } catch (error) {
      this.logger.warn(
        `Company lookup cache read bypassed for subdomain '${subdomain}', querying database: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      cached = undefined;
    }
    if (cached) return cached;

    const company = await this.companyRepository.findOne({
      where: { subdomain, isActive: true },
    });

    if (company) {
      try {
        await this.withCacheTimeout(
          () =>
            this.cacheManager.set(
              cacheKey,
              company,
              TenantsService.CACHE_TTL_MS,
            ),
          'company lookup cache write',
        );
      } catch (error) {
        this.logger.warn(
          `Company lookup cache write bypassed for subdomain '${subdomain}': ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return company;
  }

  /**
   * Drops the cached company row for a subdomain. Called by every company
   * mutation that can change what the middleware must enforce (status,
   * isActive, provisioning outcome) or serve (branding/contact fields), so a
   * suspension takes effect on the very next request instead of after the TTL.
   * Best-effort: on cache failure the short TTL is the enforcement backstop.
   */
  async invalidateSubdomainCache(subdomain: string): Promise<void> {
    try {
      await this.withCacheTimeout(
        () => this.cacheManager.del(this.subdomainCacheKey(subdomain)),
        'company lookup cache invalidation',
      );
    } catch (error) {
      this.logger.warn(
        `Company lookup cache invalidation bypassed for subdomain '${subdomain}'; stale entry expires within ${TenantsService.CACHE_TTL_MS}ms: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private subdomainCacheKey(subdomain: string): string {
    return `company:subdomain:${subdomain}`;
  }

  /**
   * Races a cache operation against a timer so a hung Redis client cannot
   * stall tenant resolution. Same pattern as AuthService.withCacheTimeout: the
   * callers catch the rejection and fall back to Postgres, and the timer is
   * always cleared so a settled operation never leaks a handle.
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
              `${label} timed out after ${TenantsService.CACHE_TIMEOUT_MS}ms`,
            ),
          ),
        TenantsService.CACHE_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Get branding information for a given subdomain.
   * EC-001: Returns default branding if subdomain is not found or not provided.
   */
  async getBranding(subdomain: string) {
    const defaultBranding = {
      commercialName: 'Odiseo B2B Default',
      logoUrl: null,
      primaryColor: '#6366f1',
    };

    if (!subdomain) {
      return defaultBranding;
    }

    const company = await this.companyRepository.findOne({
      where: { subdomain },
    });

    if (!company) {
      return defaultBranding;
    }

    return {
      commercialName: company.commercialName,
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor,
    };
  }
}
