import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsAdminService } from './tenants-admin.service';
import { JwtAuthGuard } from '../../auth/auth.guard';

@ApiTags('Admin / Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/admin/tenants')
export class TenantsAdminController {
  constructor(private readonly tenantsAdminService: TenantsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las empresas B2B' })
  async findAll() {
    return this.tenantsAdminService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Registrar y aprovisionar nueva empresa B2B' })
  async create(@Body() createData: { name: string; subdomain: string; subscription_plan_id: string }) {
    return this.tenantsAdminService.create(createData);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de suscripción de la empresa' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateData: { status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD'; grace_period_until?: string },
  ) {
    const gracePeriod = updateData.grace_period_until ? new Date(updateData.grace_period_until) : undefined;
    return this.tenantsAdminService.updateStatus(id, updateData.status, gracePeriod);
  }
}
