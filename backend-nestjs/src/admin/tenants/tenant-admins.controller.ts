import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantAdminsService } from './tenant-admins.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../roles/constants/permissions.constant';
import { TenantParamScopeGuard } from './guards/tenant-param-scope.guard';
import {
  CreateTenantAdminDto,
  UpdateTenantAdminDto,
  UpdatePasswordDto,
} from './dto/tenant-admins.dto';

@ApiTags('Admin / Tenant Admins')
@ApiBearerAuth()
// Order matters: JwtAuthGuard populates req.user, TenantParamScopeGuard binds
// the :tenantId param to that user, PermissionsGuard checks the granular perms.
@UseGuards(JwtAuthGuard, TenantParamScopeGuard, PermissionsGuard)
@Controller('v1/admin/tenants/:tenantId/admins')
export class TenantAdminsController {
  constructor(private readonly tenantAdminsService: TenantAdminsService) {}

  @Get()
  @RequirePermissions('LIST_TENANT_ADMINS')
  @ApiOperation({ summary: 'Listar administradores de una empresa (US-001)' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.tenantAdminsService.findAll(
      tenantId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Post()
  @RequirePermissions('CREATE_TENANT_ADMINS')
  @ApiOperation({ summary: 'Crear administrador para una empresa (US-002)' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() createData: CreateTenantAdminDto,
  ) {
    return this.tenantAdminsService.create(tenantId, createData);
  }

  @Patch(':userId')
  @RequirePermissions('EDIT_TENANT_ADMINS')
  @ApiOperation({ summary: 'Editar datos de un administrador (US-003)' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() updateData: UpdateTenantAdminDto,
  ) {
    return this.tenantAdminsService.update(tenantId, userId, updateData);
  }

  @Patch(':userId/password')
  @RequirePermissions('CHANGE_PASSWORD_TENANT_ADMINS')
  @ApiOperation({ summary: 'Cambiar contraseña de un administrador (US-004)' })
  async updatePassword(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() updatePasswordData: UpdatePasswordDto,
  ) {
    return this.tenantAdminsService.updatePassword(
      tenantId,
      userId,
      updatePasswordData,
    );
  }

  @Delete(':userId')
  @RequirePermissions('DELETE_TENANT_ADMINS')
  @ApiOperation({ summary: 'Eliminar lógicamente un administrador (US-005)' })
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.tenantAdminsService.softDelete(tenantId, userId);
  }
}
