import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import {
  PERMISSIONS_METADATA,
  PERMISSIONS,
} from '../constants/permissions.constant';
import { JwtAuthGuard } from '../../../auth/auth.guard';

@Controller('v1/admin/permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  getAvailablePermissions() {
    return { data: PERMISSIONS_METADATA };
  }
}
