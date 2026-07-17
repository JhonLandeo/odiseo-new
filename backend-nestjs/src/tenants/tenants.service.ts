import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Company } from './entities/tenant.entity';


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
   * Get branding information for a given subdomain.
   * EC-001: Returns default branding if subdomain is not found or not provided.
   */
  async getBranding(subdomain: string) {
    const defaultBranding = {
      commercialName: 'Odiseo B2B Default',
      logoUrl: null,
      primaryColor: '#6366f1',
    };

    if (!subdomain) {
      return defaultBranding;
    }

    const company = await this.companyRepository.findOne({
      where: { subdomain },
    });

    if (!company) {
      return defaultBranding;
    }

    return {
      commercialName: company.commercialName,
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor,
    };
  }
}
