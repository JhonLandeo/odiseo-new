import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchemaService } from '../../../database/schema.service';
import { TenantProvisioningEvent } from '../events/tenant-provisioning.event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../tenants/entities/tenant.entity';
import { TenantsService } from '../../../tenants/tenants.service';

@Injectable()
export class TenantProvisioningListener {
  private readonly logger = new Logger(TenantProvisioningListener.name);

  constructor(
    private readonly schemaService: SchemaService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Provisioning flips isActive/status, which the subdomain-lookup cache
   * serves to TenantMiddleware; drop the cached row so the outcome (schema
   * ready, or SUSPENDED on failure) is visible on the next request.
   */
  private async invalidateCompanyLookup(companyId: string): Promise<void> {
    // Best-effort: the status write already committed, and a failure here must
    // not re-enter the provisioning error path (which would suspend a company
    // that provisioned fine). The cache TTL is the backstop.
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

  @OnEvent('tenant.provisioning.started', { async: true })
  async handleTenantProvisioningEvent(event: TenantProvisioningEvent) {
    this.logger.log(
      `Received provisioning event for tenant ${event.schemaName}`,
    );
    try {
      // Create the schema
      await this.schemaService.createTenantSchema(event.schemaName);

      // Provision tables and seed admin user
      await this.schemaService.seedTenantSchema(
        event.schemaName,
        event.companyId,
      );

      this.logger.log(`Tenant ${event.schemaName} successfully provisioned.`);
      // Optionally update company status here if you add an 'isActive' or 'isProvisioned' column
      await this.companyRepository.update(event.companyId, { isActive: true });
      await this.invalidateCompanyLookup(event.companyId);
    } catch (error) {
      this.logger.error(
        `Error provisioning tenant ${event.schemaName}:`,
        error,
      );
      // Fallback: suspend the company or mark it as failed so admins know
      await this.companyRepository.update(event.companyId, {
        isActive: false,
        status: 'SUSPENDED',
      });
      await this.invalidateCompanyLookup(event.companyId);
    }
  }
}
