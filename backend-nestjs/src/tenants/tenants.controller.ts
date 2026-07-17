import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('v1')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('tenants/branding')
  async getBranding(@Query('subdomain') subdomain: string) {
    return this.tenantsService.getBranding(subdomain);
  }
}
