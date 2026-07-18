import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../tenants/entities/tenant.entity';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  // Public paths that don't require tenant resolution
  private readonly publicPaths = [
    '/api/v1/tenants/branding',
    '/v1/tenants/branding',
    '/api/v1/admin',
    '/v1/admin',
    '/queues',
  ];

  constructor(
    private readonly cls: ClsService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract subdomain from x-subdomain header or from host
    const host = req.headers.host || '';
    let subdomain = req.headers['x-subdomain'] as string;

    if (!subdomain && host) {
      const parts = host.split('.');
      if (
        parts.length >= 2 &&
        parts[0] !== 'www' &&
        !parts[0].startsWith('localhost')
      ) {
        subdomain = parts[0];
      }
    }

    // Store subdomain in CLS for all routes
    this.cls.set('subdomain', subdomain || null);

    // For public paths, skip tenant resolution
    const requestPath = req.baseUrl + req.path;
    if (this.publicPaths.some((p) => requestPath.startsWith(p))) {
      next();
      return;
    }

    // If no subdomain, block the request (EC-002)
    if (!subdomain) {
      throw new BadRequestException(
        'Unable to resolve subdomain. Ensure you are accessing via a valid tenant URL.',
      );
    }

    // Resolve subdomain → company → tenantSchema via DB
    const company = await this.companyRepository.findOne({
      where: { subdomain, isActive: true },
    });

    if (!company) {
      throw new BadRequestException(
        `The subdomain '${subdomain}' does not correspond to any registered company.`,
      );
    }

    // Enforce subscription status: a SUSPENDED company must not resolve to its
    // tenant context, even if isActive is still true. GRACE_PERIOD stays allowed.
    if (company.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `The company '${subdomain}' is currently suspended. Please contact support.`,
      );
    }

    // Set resolved tenant data in CLS
    const tenantSchema = `tenant_${company.id}`;
    this.cls.set('tenantSchema', tenantSchema);
    this.cls.set('companyId', company.id);

    next();
  }
}
