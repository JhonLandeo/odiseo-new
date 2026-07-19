import {
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Company } from '../../tenants/entities/tenant.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantProvisioningEvent } from './events/tenant-provisioning.event';
import { TenantService } from '../../database/tenant.service';
import { TenantsService } from '../../tenants/tenants.service';
import { AuthService } from '../../auth/auth.service';
import { assertValidSchema } from '../../database/schema-name.util';
import { mapWithConcurrency } from '../../common/utils/map-with-concurrency.util';

// Name of the tenant's system-default admin role (matches the provisioning seed).
const SUPER_ADMIN_ROLE_NAME = 'Super Administrador';

// Upper bound on simultaneous per-tenant-schema queries. The pool holds 20
// connections shared with request traffic; fanning out one query per tenant
// with Promise.all would let a platform listing starve everything else.
const SCHEMA_FANOUT_CONCURRENCY = 4;

@Injectable()
export class TenantsAdminService {
  private readonly logger = new Logger(TenantsAdminService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantService: TenantService,
    private readonly tenantsService: TenantsService,
    private readonly authService: AuthService,
  ) {}

  async findAll(): Promise<any[]> {
    const companies = await this.companyRepository.find({
      relations: ['subscriptionPlan'],
    });

    // Bounded fan-out, one worker pool for every tenant schema: see
    // SCHEMA_FANOUT_CONCURRENCY. A single tenant whose schema is broken must
    // not blank out the listing for every other tenant, so per-tenant query
    // failures degrade to hasActiveSuperadmin: false with a warning.
    const result = await mapWithConcurrency(
      companies,
      SCHEMA_FANOUT_CONCURRENCY,
      async (company) => {
        const schemaName = `tenant_${company.id}`;
        // The schema name is interpolated into SQL below and identifiers
        // cannot be parameterized; the allowlist must run BEFORE any SQL is
        // built, and outside the tolerance catch — a name that fails it is
        // corrupt or hostile data, never a provisioning hiccup to skip past.
        assertValidSchema(schemaName);

        let hasActiveSuperadmin = false;
        try {
          const res = await this.companyRepository.manager.query(`
            SELECT 1
            FROM "${schemaName}".users u
            JOIN "${schemaName}".user_roles ur ON u.id = ur.user_id
            JOIN "${schemaName}".roles r ON ur.role_id = r.id
            WHERE r.name = 'Super Administrador'
              AND u.is_active = true
            LIMIT 1
          `);
          hasActiveSuperadmin = res.length > 0;
        } catch (e) {
          // Schema or table might not exist yet (mid-provisioning / failed
          // provisioning); report the tenant anyway.
          this.logger.warn(
            `Schema ${schemaName} not available while listing tenants: ${
              e instanceof Error ? e.message : 'unknown error'
            }`,
          );
        }

        return {
          ...company,
          hasActiveSuperadmin,
        };
      },
    );

    return result;
  }

  async create(data: {
    name: string;
    subdomain: string;
    subscription_plan_id: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    logoUrl?: string;
  }): Promise<Company> {
    const existing = await this.companyRepository.findOne({
      where: { subdomain: data.subdomain },
    });
    if (existing) {
      throw new ConflictException(
        `Tenant con subdominio ${data.subdomain} ya existe.`,
      );
    }

    // Create the company entity first (so we have its ID for the tenant schema tables).
    //
    // isActive starts FALSE: provisioning is asynchronous, and
    // TenantsService.findBySubdomain — which feeds TenantMiddleware — filters
    // on isActive, so an active row would resolve tenant requests to a schema
    // that does not exist yet. The provisioning listener flips isActive on
    // only after the schema is created and seeded (and suspends on failure),
    // so the company becomes serviceable exactly when its schema does.
    const company = this.companyRepository.create({
      commercialName: data.name,
      subdomain: data.subdomain,
      subscriptionPlanId: data.subscription_plan_id,
      status: 'ACTIVE',
      isActive: false,
      contactEmail: data.contactEmail,
      phone: data.phone,
      address: data.address,
      taxId: data.taxId,
      logoUrl: data.logoUrl,
    });

    let savedCompany: Company;
    try {
      savedCompany = await this.companyRepository.save(company);
    } catch (error) {
      // The upfront findOne cannot see a concurrent insert; the UNIQUE
      // constraint on subdomain is the race-safe check. Map its violation to
      // the same 409 instead of surfacing a raw driver error as a 500.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Tenant con subdominio ${data.subdomain} ya existe.`,
        );
      }
      throw error;
    }

    // Emit the provisioning event to handle schema creation asynchronously
    const schemaName = `tenant_${savedCompany.id}`;
    this.eventEmitter.emit(
      'tenant.provisioning.started',
      new TenantProvisioningEvent(schemaName, savedCompany.id),
    );

    return savedCompany;
  }

  // Postgres unique_violation. TypeORM surfaces the driver error either
  // directly or wrapped in QueryFailedError with the code on `driverError`.
  private isUniqueViolation(error: unknown): boolean {
    const candidate = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      candidate?.code === '23505' || candidate?.driverError?.code === '23505'
    );
  }

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD',
    gracePeriodUntil?: Date,
  ): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // isActive is the serviceability gate findBySubdomain filters on, and this
    // endpoint is the only recovery path for a tenant that never got activated
    // (failed provisioning, or a crash before the listener's activation
    // write). Reactivate only if the schema really exists; otherwise refuse —
    // a 200 would leave the company ACTIVE on paper but unresolvable forever.
    if (status === 'ACTIVE' && !company.isActive) {
      const schemaName = `tenant_${company.id}`;
      assertValidSchema(schemaName);
      const schemas = await this.companyRepository.manager.query(
        `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName],
      );
      if (schemas.length === 0) {
        throw new ConflictException(
          `El esquema del tenant ${company.subdomain} nunca fue aprovisionado; se requiere re-aprovisionarlo antes de activarlo.`,
        );
      }
      company.isActive = true;
    }

    company.status = status;
    if (status === 'GRACE_PERIOD' && gracePeriodUntil) {
      company.gracePeriodUntil = gracePeriodUntil;
    } else {
      company.gracePeriodUntil = undefined as any;
    }

    const saved = await this.companyRepository.save(company);
    // TenantMiddleware serves this company from the subdomain-lookup cache, so
    // a suspension must drop the cached row or it would keep resolving as
    // ACTIVE for up to the cache TTL.
    await this.tenantsService.invalidateSubdomainCache(saved.subdomain);
    return saved;
  }

  async update(
    id: string,
    data: {
      commercialName?: string;
      subscription_plan_id?: string;
      contactEmail?: string;
      phone?: string;
      address?: string;
      taxId?: string;
      logoUrl?: string;
    },
  ): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    if (data.commercialName !== undefined)
      company.commercialName = data.commercialName;
    if (data.subscription_plan_id !== undefined)
      company.subscriptionPlanId = data.subscription_plan_id;
    if (data.contactEmail !== undefined)
      company.contactEmail = data.contactEmail;
    if (data.phone !== undefined) company.phone = data.phone;
    if (data.address !== undefined) company.address = data.address;
    if (data.taxId !== undefined) company.taxId = data.taxId;
    if (data.logoUrl !== undefined) company.logoUrl = data.logoUrl;

    const saved = await this.companyRepository.save(company);
    // The cached lookup stores the whole company row; drop it so reads through
    // the cache never serve the pre-update fields for the TTL.
    await this.tenantsService.invalidateSubdomainCache(saved.subdomain);
    return saved;
  }

  async resetAdminCredentials(
    id: string,
    newEmail: string,
    newPassword?: string,
  ): Promise<{
    success: boolean;
    newEmail: string;
    temporaryPassword?: string;
  }> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // No hardcoded default: when no password is supplied, generate a strong
    // random one and return it once so the operator can hand it over.
    const generated = newPassword
      ? undefined
      : randomBytes(12).toString('base64url');
    const password = newPassword ?? generated!;
    const passwordHash = await bcrypt.hash(password, 10);
    const schemaName = `tenant_${company.id}`;

    const result = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        // search_path is set to the tenant schema, so tables are unqualified.
        //
        // Refuse rather than choose. This overwrites an administrator's email
        // and password irreversibly, and a tenant may hold more than one Super
        // Administrator. Picking one — even deterministically — silently
        // designates a victim the operator never named and cannot see. The
        // ambiguity is the operator's to resolve, so surface it instead.
        // `tenant-admins.service.ts` sets the same precedent when it refuses to
        // deactivate the last remaining administrator.
        const admins = await manager.query(
          `SELECT u.id
           FROM user_roles ur
           JOIN roles r ON ur.role_id = r.id
           JOIN users u ON u.id = ur.user_id
           WHERE r.name = $1`,
          [SUPER_ADMIN_ROLE_NAME],
        );

        if (admins.length === 0) {
          throw new NotFoundException(
            'Administrador principal no encontrado en el esquema del cliente.',
          );
        }
        if (admins.length > 1) {
          throw new ConflictException(
            `La empresa tiene ${admins.length} administradores principales. ` +
              'Indique cuál restablecer desde la gestión de administradores del cliente.',
          );
        }

        // force_password_reset: see TenantAdminsService.create — the operator,
        // not the administrator, chose this password (AC-016).
        const updateResult = await manager.query(
          `UPDATE users
           SET email = $1, password_hash = $2, force_password_reset = true, updated_at = now()
           WHERE id = $3
           RETURNING id`,
          [newEmail, passwordHash, admins[0].id],
        );
        return { updateResult, adminId: admins[0].id as string };
      },
    );

    // TypeORM's Postgres driver returns `[rows, affectedRowCount]` for UPDATE
    // and DELETE commands — NOT the row array. Checking `result.length` here
    // would always see 2 and never fire, reporting success for a reset that
    // touched nothing. Only the affected count proves the write happened, so
    // any other shape is a driver-contract change and must fail loudly rather
    // than be misread as "0 rows" (a masked success) or "success" (a masked
    // no-op).
    if (
      !Array.isArray(result.updateResult) ||
      result.updateResult.length !== 2 ||
      typeof result.updateResult[1] !== 'number'
    ) {
      throw new Error(
        `Unexpected UPDATE result shape from the Postgres driver: expected [rows, affectedRowCount], got ${JSON.stringify(
          result.updateResult,
        )}`,
      );
    }
    const [, affectedRows] = result.updateResult as [unknown, number];
    if (!affectedRows) {
      throw new NotFoundException(
        'Administrador principal no encontrado en el esquema del cliente.',
      );
    }

    // The reset raises force_password_reset, which is served from the cached
    // auth state: without dropping it the hold stays invisible (and the old
    // permissions stay live) for up to the cache TTL. Best-effort — the write
    // already committed, so a cache failure is logged, never surfaced.
    try {
      await this.authService.invalidateUserPermissions(
        company.id,
        result.adminId,
      );
    } catch (error) {
      this.logger.warn(
        `Auth-state cache invalidation failed for admin ${result.adminId} in company ${company.id}; stale entry expires with the TTL: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return { success: true, newEmail, temporaryPassword: generated };
  }
}
