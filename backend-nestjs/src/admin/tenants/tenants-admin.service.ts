import {
  Injectable,
  ConflictException,
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

// Name of the tenant's system-default admin role (matches the provisioning seed).
const SUPER_ADMIN_ROLE_NAME = 'Super Administrador';

@Injectable()
export class TenantsAdminService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantService: TenantService,
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
      }),
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

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD',
    gracePeriodUntil?: Date,
  ): Promise<Company> {
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

    return this.companyRepository.save(company);
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

        return manager.query(
          `UPDATE users
           SET email = $1, password_hash = $2, updated_at = now()
           WHERE id = $3
           RETURNING id`,
          [newEmail, passwordHash, admins[0].id],
        );
      },
    );

    // TypeORM's Postgres driver returns `[rows, affectedRowCount]` for UPDATE
    // and DELETE commands — NOT the row array. Checking `result.length` here
    // would always see 2 and never fire, reporting success for a reset that
    // touched nothing. Only the affected count proves the write happened.
    const affectedRows = Array.isArray(result) ? (result[1] as number) : 0;
    if (!affectedRows) {
      throw new NotFoundException(
        'Administrador principal no encontrado en el esquema del cliente.',
      );
    }

    return { success: true, newEmail, temporaryPassword: generated };
  }
}
