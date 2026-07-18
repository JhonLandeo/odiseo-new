import { Controller, Put, Param, Body, UseGuards } from '@nestjs/common';
import { UserRole } from '../entities/user-role.entity';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';
import { JwtAuthGuard } from '../../../auth/auth.guard';
import { TenantService } from '../../../database/tenant.service';
import { AssignRolesDto } from '../dto/assign-roles.dto';
import { AuthService } from '../../../auth/auth.service';
import { ClsService } from 'nestjs-cls';

@Controller('v1/admin/users/:userId/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserRolesController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
    private readonly cls: ClsService,
  ) {}

  @Put()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async assignRoles(
    @Param('userId') userId: string,
    @Body() dto: AssignRolesDto,
  ) {
    // Tenant-scoped and atomic: runInTenant wraps the replace in one
    // transaction, so a failed insert can no longer leave the user role-less.
    await this.tenantService.runInTenant(async (manager) => {
      const repo = manager.getRepository(UserRole);
      await repo.delete({ userId });

      if (dto.role_ids && dto.role_ids.length > 0) {
        const newUserRoles = dto.role_ids.map((roleId) =>
          repo.create({ userId, roleId }),
        );
        await repo.save(newUserRoles);
      }
    });

    // The user's effective permissions just changed; drop the cached set after
    // the transaction commits so the very next request re-reads them instead of
    // running on the previous role set for up to 60s.
    const companyId = this.cls.get('companyId');
    if (companyId) {
      await this.authService.invalidateUserPermissions(companyId, userId);
    }

    return { success: true };
  }
}
