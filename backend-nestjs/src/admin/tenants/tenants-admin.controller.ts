import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  DEFAULT_TENANTS_PAGE_SIZE,
  TenantsAdminService,
} from './tenants-admin.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../roles/constants/permissions.constant';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateTenantStatusDto,
  ResetAdminDto,
} from './dto/tenant.dto';

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

  @Get('lite')
  @ApiOperation({
    summary: 'Listar id+nombre de empresas activas (para selectores de UI)',
  })
  async findAllLite() {
    return this.tenantsAdminService.findAllLite();
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las empresas B2B' })
  async findAll(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    // Page is caller-controlled and drives `skip`: garbage input must fail
    // loudly rather than silently fall back, or an operator paging past the
    // end (or with a typo) would be misled by a quietly-reset page 1.
    let page = 1;
    if (pageParam !== undefined) {
      page = Number(pageParam);
      if (!Number.isInteger(page) || page < 1) {
        throw new BadRequestException(
          'page debe ser un entero mayor o igual a 1',
        );
      }
    }

    // pageSize only bounds response size / fan-out cost, so an out-of-range
    // value is clamped rather than rejected — the service enforces the same
    // clamp, this just keeps the invalid-caller-input handling consistent
    // with `page` at the boundary.
    let pageSize = DEFAULT_TENANTS_PAGE_SIZE;
    if (pageSizeParam !== undefined) {
      const parsed = Number(pageSizeParam);
      pageSize =
        Number.isInteger(parsed) && parsed >= 1
          ? parsed
          : DEFAULT_TENANTS_PAGE_SIZE;
    }

    return this.tenantsAdminService.findAll(page, pageSize);
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
    const gracePeriod = updateData.grace_period_until
      ? new Date(updateData.grace_period_until)
      : undefined;
    return this.tenantsAdminService.updateStatus(
      id,
      updateData.status,
      gracePeriod,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos básicos de la empresa' })
  async update(@Param('id') id: string, @Body() updateData: UpdateTenantDto) {
    return this.tenantsAdminService.update(id, updateData);
  }

  @Post(':id/reset-admin')
  @ApiOperation({ summary: 'Resetear credenciales del Director de la empresa' })
  async resetAdminCredentials(
    @Param('id') id: string,
    @Body() resetData: ResetAdminDto,
  ) {
    return this.tenantsAdminService.resetAdminCredentials(
      id,
      resetData.email,
      resetData.password,
    );
  }
}
