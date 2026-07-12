import { Controller, Put, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../entities/user-role.entity';
import { PermissionsGuard, RequirePermissions } from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';

@Controller('v1/admin/users/:userId/roles')
@UseGuards(PermissionsGuard)
export class UserRolesController {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}

  @Put()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async assignRoles(@Param('userId') userId: string, @Body('role_ids') roleIds: string[]) {
    // 1. Delete existing roles for this user
    await this.userRoleRepository.delete({ userId });

    // 2. Insert new roles if provided
    if (roleIds && roleIds.length > 0) {
      const newUserRoles = roleIds.map(roleId => this.userRoleRepository.create({ userId, roleId }));
      await this.userRoleRepository.save(newUserRoles);
    }
    
    return { success: true };
  }
}
