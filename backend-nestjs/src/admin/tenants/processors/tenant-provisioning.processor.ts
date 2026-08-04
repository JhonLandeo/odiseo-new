import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchemaService } from '../../../database/schema.service';
import { Company } from '../../../tenants/entities/tenant.entity';
import { TenantsService } from '../../../tenants/tenants.service';
import { TenantAdminsService } from '../tenant-admins.service';

/** Payload of a 'provision' job on the tenant-provisioning-queue. */
export interface TenantProvisioningJobData {
  schemaName: string;
  companyId: string;
  // Option A: when BOTH are present the initial Super Administrador is
  // provisioned inside the new schema as part of this job. Absent for the
  // decoupled flow (create the tenant now, add the admin later).
  adminEmail?: string;
  adminPassword?: string;
}

@Processor('tenant-provisioning-queue')
export class TenantProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantProvisioningProcessor.name);

  constructor(
    private readonly schemaService: SchemaService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly tenantsService: TenantsService,
    private readonly tenantAdminsService: TenantAdminsService,
  ) {
    super();
  }

  /**
   * Provisioning flips isActive/status, which the subdomain-lookup cache
   * serves to TenantMiddleware; drop the cached row so the outcome (schema
   * ready, or SUSPENDED once retries are exhausted) is visible on the next
   * request.
   */
  private async invalidateCompanyLookup(companyId: string): Promise<void> {
    // Best-effort: the status write already committed, and a failure here
    // must not be treated as a provisioning failure. The cache TTL is the
    // backstop.
    try {
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
      });
      if (company) {
        await this.tenantsService.invalidateSubdomainCache(company.subdomain);
      }
    } catch (error) {
      this.logger.warn(
        `Company lookup cache invalidation failed for company ${companyId}; stale entry expires with the TTL: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async process(
    job: Job<TenantProvisioningJobData, void, string>,
  ): Promise<void> {
    const { schemaName, companyId, adminEmail, adminPassword } = job.data;
    this.logger.log(
      `Processing provisioning job ${job.id} for tenant ${schemaName} (attempt ${
        job.attemptsMade + 1
      })`,
    );

    // Create the schema.
    await this.schemaService.createTenantSchema(schemaName);

    // Provision tables and seed the default role.
    await this.schemaService.seedTenantSchema(schemaName, companyId);

    // Option A: seed the initial Super Administrador BEFORE activation, so a
    // tenant only ever becomes serviceable once its admin can sign in. Both
    // credentials come together (the create endpoint rejects one without the
    // other), so the presence of both is the switch. createSuperAdminInSchema
    // is idempotent — a retry after a partially-completed job (admin committed,
    // activation failed) skips the already-existing user instead of failing on
    // a duplicate. The email has no separate display name in the payload, so it
    // doubles as the name (the admin renames on first sign-in).
    if (adminEmail && adminPassword) {
      await this.tenantAdminsService.createSuperAdminInSchema(companyId, {
        email: adminEmail,
        name: adminEmail,
        password: adminPassword,
      });
    }

    this.logger.log(`Tenant ${schemaName} successfully provisioned.`);
    // This is the ONLY place a company becomes serviceable: it is created
    // with isActive: false, and findBySubdomain (TenantMiddleware) filters
    // on isActive, so requests cannot resolve to the tenant until its schema
    // exists and is seeded. Activation must stay AFTER both steps.
    await this.companyRepository.update(companyId, { isActive: true });
    await this.invalidateCompanyLookup(companyId);

    // Deliberately no try/catch here: a transient failure (createTenantSchema
    // or seedTenantSchema throwing) must propagate so BullMQ marks this
    // attempt failed and retries per TENANT_PROVISIONING_JOB_OPTIONS.attempts.
    // Both steps are idempotent (see the constants file), so re-running this
    // whole method from the top on retry is safe. Suspending the company on
    // the FIRST failure — the old EventEmitter2 listener's behavior — would
    // flip a tenant to SUSPENDED that was about to succeed on retry 2; that
    // fallback now lives in handleFailed below, gated on attempts exhausted.
  }

  /**
   * Fires after EVERY failed attempt, not only the last. Only mark the
   * company SUSPENDED once BullMQ has exhausted every configured attempt —
   * otherwise a transient blip on attempt 1 would suspend a company mid-retry,
   * before it ever got the chance to succeed on attempt 2 or 3.
   */
  @OnWorkerEvent('failed')
  async handleFailed(
    job: Job<TenantProvisioningJobData, void, string> | undefined,
    error: Error,
  ): Promise<void> {
    // A job can be undefined here (e.g. it was removed before this handler
    // ran); there is nothing to act on in that case.
    if (!job) return;

    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(
        `Provisioning attempt ${job.attemptsMade}/${maxAttempts} failed for tenant ${job.data.schemaName}, will retry: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `Provisioning permanently failed for tenant ${job.data.schemaName} after ${job.attemptsMade} attempt(s): ${error.message}`,
    );
    // Fallback: suspend the company so admins know, matching the pre-queue
    // listener's behavior — just deferred past the retry window instead of
    // firing on the first transient blip.
    await this.companyRepository.update(job.data.companyId, {
      isActive: false,
      status: 'SUSPENDED',
    });
    await this.invalidateCompanyLookup(job.data.companyId);
  }
}
