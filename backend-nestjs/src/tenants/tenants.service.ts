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

}
