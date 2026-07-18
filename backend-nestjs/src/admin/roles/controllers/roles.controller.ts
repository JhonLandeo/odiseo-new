import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';
import { JwtAuthGuard } from '../../../auth/auth.guard';

@Controller('v1/admin/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  async findAll() {
    const roles = await this.rolesService.findAll();
    return { data: roles };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
