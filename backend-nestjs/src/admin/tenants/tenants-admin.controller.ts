import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsAdminService } from './tenants-admin.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../roles/constants/permissions.constant';
import { CreateTenantDto, UpdateTenantDto, UpdateTenantStatusDto, ResetAdminDto } from './dto/tenant.dto';

// Platform control plane: every endpoint manages tenants across the whole
// platform, so all require the platform-level MANAGE_TENANTS permission (which
// tenant-scoped Super Admins do NOT have). Without this, any authenticated user
// of any tenant could suspend companies or reset another tenant's admin.
@ApiTags('Admin / Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.MANAGE_TENANTS)
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
  async create(@Body() createData: CreateTenantDto) {
    return this.tenantsAdminService.create(createData);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de suscripción de la empresa' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateData: UpdateTenantStatusDto,
  ) {
    const gracePeriod = updateData.grace_period_until ? new Date(updateData.grace_period_until) : undefined;
    return this.tenantsAdminService.updateStatus(id, updateData.status, gracePeriod);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos básicos de la empresa' })
  async update(
    @Param('id') id: string,
    @Body() updateData: UpdateTenantDto,
  ) {
    return this.tenantsAdminService.update(id, updateData);
  }

  @Post(':id/reset-admin')
  @ApiOperation({ summary: 'Resetear credenciales del Director de la empresa' })
  async resetAdminCredentials(
    @Param('id') id: string,
    @Body() resetData: ResetAdminDto,
  ) {
    return this.tenantsAdminService.resetAdminCredentials(id, resetData.email, resetData.password);
  }
}
