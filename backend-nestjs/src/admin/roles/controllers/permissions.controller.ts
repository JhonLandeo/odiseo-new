import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard, RequirePermissions } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_METADATA, PERMISSIONS } from '../constants/permissions.constant';

@Controller('v1/admin/permissions')
@UseGuards(PermissionsGuard)
export class PermissionsController {
  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  getAvailablePermissions() {
    return { data: PERMISSIONS_METADATA };
  }
}
