import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Creates a new PostgreSQL schema for a given tenant.
   * @param schemaName The name of the schema (typically the tenant's subdomain).
   */
  async createTenantSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Provisioning schema for tenant: ${schemaName}`);
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      // Here we could also run migrations programmatically if needed.
      this.logger.log(`Schema "${schemaName}" provisioned successfully`);
    } catch (error) {
      this.logger.error(`Error provisioning schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
