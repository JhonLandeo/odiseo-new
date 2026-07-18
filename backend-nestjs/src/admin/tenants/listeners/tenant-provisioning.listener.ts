import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchemaService } from '../../../database/schema.service';
import { TenantProvisioningEvent } from '../events/tenant-provisioning.event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../tenants/entities/tenant.entity';

@Injectable()
export class TenantProvisioningListener {
  private readonly logger = new Logger(TenantProvisioningListener.name);

  constructor(
    private readonly schemaService: SchemaService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

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
    }
  }
}
