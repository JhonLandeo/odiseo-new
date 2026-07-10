import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Company } from './entities/tenant.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find a company by subdomain. Returns null if not found.
   */
  async findBySubdomain(subdomain: string): Promise<Company | null> {
    return this.companyRepository.findOne({
      where: { subdomain, isActive: true },
    });
  }

  /**
   * Creates a new company and provisions its tenant schema.
   * 1. Insert into public.companies
   * 2. CREATE SCHEMA tenant_<company_id>
   * 3. Run base migrations for tenant tables
   * 4. Seed V1 admin role with all permissions
   */
  async createCompany(data: {
    subdomain: string;
    commercialName: string;
    logoUrl?: string;
    primaryColor?: string;
  }): Promise<Company> {
    // Check for duplicate subdomain
    const existing = await this.companyRepository.findOne({
      where: { subdomain: data.subdomain },
    });
    if (existing) {
      throw new ConflictException(
        `The subdomain '${data.subdomain}' is already registered`,
      );
    }

    // Create company record
    const company = this.companyRepository.create({
      subdomain: data.subdomain,
      commercialName: data.commercialName,
      logoUrl: data.logoUrl,
      primaryColor: data.primaryColor || '#6366f1',
    });
    const saved = await this.companyRepository.save(company);

    // 1. Validate UUID (Security: prevent SQL injection in schema name)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.id)) {
      throw new ConflictException('Invalid company ID format');
    }

    const schemaName = `tenant_${saved.id}`;
    const queryRunner = this.dataSource.createQueryRunner();
    
    await queryRunner.connect();

    try {
      // 2. Create secure schema (TypeORM sanitizes the schemaName under the hood)
      await queryRunner.createSchema(schemaName, true);

      // 3. Execute initialization script (Clean Code: separate DDL)
      const initScriptPath = path.join(__dirname, 'scripts', 'tenant-schema-init.sql');
      const initSql = await fs.readFile(initScriptPath, 'utf8');

      await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
      await queryRunner.query(initSql);
    } finally {
      await queryRunner.release();
    }

    return saved;
  }
}
