import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../tenants/entities/tenant.entity';
import { SchemaService } from '../../database/schema.service';

@Injectable()
export class TenantsAdminService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly schemaService: SchemaService,
  ) {}

  async findAll(): Promise<Company[]> {
    return this.companyRepository.find({
      relations: ['subscriptionPlan'],
    });
  }

  async create(data: { name: string; subdomain: string; subscription_plan_id: string }): Promise<Company> {
    const existing = await this.companyRepository.findOne({ where: { subdomain: data.subdomain } });
    if (existing) {
      throw new ConflictException(`Tenant con subdominio ${data.subdomain} ya existe.`);
    }

    // Create the schema
    await this.schemaService.createTenantSchema(data.subdomain);

    const company = this.companyRepository.create({
      commercialName: data.name,
      subdomain: data.subdomain,
      subscriptionPlanId: data.subscription_plan_id,
      status: 'ACTIVE',
      isActive: true,
    });

    return this.companyRepository.save(company);
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
}
