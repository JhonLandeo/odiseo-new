import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Company } from '../../tenants/entities/tenant.entity';
import { SchemaService } from '../../database/schema.service';

@Injectable()
export class TenantsAdminService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly schemaService: SchemaService,
  ) {}

  async findAll(): Promise<any[]> {
    const companies = await this.companyRepository.find({
      relations: ['subscriptionPlan'],
    });

    const result = [];
    for (const company of companies) {
      let adminEmail = null;
      try {
        const schemaName = `tenant_${company.id}`;
        const users = await this.companyRepository.manager.query(
          `SELECT email FROM "${schemaName}".users LIMIT 1`
        );
        if (users && users.length > 0) {
          adminEmail = users[0].email;
        }
      } catch (e) {
        // Schema or table might not exist yet or is the public schema
      }

      result.push({
        ...company,
        adminEmail: adminEmail || company.contactEmail || 'No registrado',
      });
    }

    return result;
  }

  async create(data: { 
    name: string; 
    subdomain: string; 
    subscription_plan_id: string; 
    adminEmail: string; 
    adminPassword?: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    logoUrl?: string;
  }): Promise<Company> {
    const existing = await this.companyRepository.findOne({ where: { subdomain: data.subdomain } });
    if (existing) {
      throw new ConflictException(`Tenant con subdominio ${data.subdomain} ya existe.`);
    }

    // Hash admin password (or use a secure default for testing)
    const password = data.adminPassword || 'Temporal123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Create the company entity first (so we have its ID for the tenant schema tables)
    const company = this.companyRepository.create({
      commercialName: data.name,
      subdomain: data.subdomain,
      subscriptionPlanId: data.subscription_plan_id,
      status: 'ACTIVE',
      isActive: true,
      contactEmail: data.contactEmail || data.adminEmail,
      phone: data.phone,
      address: data.address,
      taxId: data.taxId,
      logoUrl: data.logoUrl,
    });
    const savedCompany = await this.companyRepository.save(company);

    // Create the schema
    const schemaName = `tenant_${savedCompany.id}`;
    await this.schemaService.createTenantSchema(schemaName);

    // Provision tables and seed admin user
    await this.schemaService.seedTenantSchema(schemaName, savedCompany.id, data.adminEmail, passwordHash);

    return savedCompany;
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD', gracePeriodUntil?: Date): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    company.status = status;
    if (status === 'GRACE_PERIOD' && gracePeriodUntil) {
      company.gracePeriodUntil = gracePeriodUntil;
    } else {
      company.gracePeriodUntil = undefined as any;
    }

    return this.companyRepository.save(company);
  }

  async update(id: string, data: { 
    commercialName?: string; 
    subscription_plan_id?: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    logoUrl?: string;
  }): Promise<Company> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    if (data.commercialName !== undefined) company.commercialName = data.commercialName;
    if (data.subscription_plan_id !== undefined) company.subscriptionPlanId = data.subscription_plan_id;
    if (data.contactEmail !== undefined) company.contactEmail = data.contactEmail;
    if (data.phone !== undefined) company.phone = data.phone;
    if (data.address !== undefined) company.address = data.address;
    if (data.taxId !== undefined) company.taxId = data.taxId;
    if (data.logoUrl !== undefined) company.logoUrl = data.logoUrl;

    return this.companyRepository.save(company);
  }

  async resetAdminCredentials(id: string, newEmail: string, newPassword?: string): Promise<{ success: boolean; newEmail: string }> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const password = newPassword || 'Temporal123!';
    const passwordHash = await bcrypt.hash(password, 10);
    const schemaName = `tenant_${company.id}`;

    const queryRunner = this.companyRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();

    try {
      // Find and update the Director user in the tenant schema
      const updateQuery = `
        UPDATE "${schemaName}".users 
        SET email = $1, password_hash = $2, updated_at = now()
        WHERE id = (
          SELECT mhr.model_id 
          FROM "${schemaName}".model_has_roles mhr 
          JOIN "${schemaName}".roles r ON mhr.role_id = r.id 
          WHERE r.name = 'Director' AND mhr.model_type = 'User'
          LIMIT 1
        )
      `;
      const result = await queryRunner.query(updateQuery, [newEmail, passwordHash]);
      
      if (result[1] === 0) { // result[1] is the rowCount in Postgres update
        throw new NotFoundException('Usuario Director no encontrado en el esquema del cliente.');
      }
      
      return { success: true, newEmail };
    } catch (error) {
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
