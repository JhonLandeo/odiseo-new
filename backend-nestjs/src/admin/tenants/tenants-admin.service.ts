import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Company } from '../../tenants/entities/tenant.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantProvisioningEvent } from './events/tenant-provisioning.event';

@Injectable()
export class TenantsAdminService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<any[]> {
    const companies = await this.companyRepository.find({
      relations: ['subscriptionPlan'],
    });

    const result = await Promise.all(
      companies.map(async (company) => {
        let hasActiveSuperadmin = false;
        try {
          const schemaName = `tenant_${company.id}`;
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
          // Schema or table might not exist yet
        }

        return {
          ...company,
          hasActiveSuperadmin,
        };
      })
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
    const existing = await this.companyRepository.findOne({ where: { subdomain: data.subdomain } });
    if (existing) {
      throw new ConflictException(`Tenant con subdominio ${data.subdomain} ya existe.`);
    }

    // Create the company entity first (so we have its ID for the tenant schema tables)
    const company = this.companyRepository.create({
      commercialName: data.name,
      subdomain: data.subdomain,
      subscriptionPlanId: data.subscription_plan_id,
      status: 'ACTIVE',
      isActive: true,
      contactEmail: data.contactEmail,
      phone: data.phone,
      address: data.address,
      taxId: data.taxId,
      logoUrl: data.logoUrl,
    });
    const savedCompany = await this.companyRepository.save(company);

    // Emit the provisioning event to handle schema creation asynchronously
    const schemaName = `tenant_${savedCompany.id}`;
    this.eventEmitter.emit(
      'tenant.provisioning.started',
      new TenantProvisioningEvent(schemaName, savedCompany.id),
    );

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
          SELECT ur.user_id 
          FROM "${schemaName}".user_roles ur 
          JOIN "${schemaName}".roles r ON ur.role_id = r.id 
          WHERE r.name = 'Director'
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
