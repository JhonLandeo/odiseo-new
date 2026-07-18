import { Controller, Get, Query } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('tenants/branding')
  // Pre-login branding (FR-004): the login screen renders tenant identity
  // before any credentials exist, so this cannot require a JWT.
  @Public()
  async getBranding(@Query('subdomain') subdomain: string) {
    return this.tenantsService.getBranding(subdomain);
  }
}
