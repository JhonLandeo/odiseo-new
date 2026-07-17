import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard, RequirePermissions } from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';
import { UsersService } from '../services/users.service';

@Controller('v1/admin/users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async findAll() {
    return this.usersService.findAllUsersWithRoles();
  }
}
