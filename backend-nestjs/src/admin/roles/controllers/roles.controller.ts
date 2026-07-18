import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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

  // JwtAuthGuard puts the verified JWT payload on the request; `sub` is the
  // acting user's id. The service re-reads that user's permissions from the
  // authoritative source, so nothing client-supplied is trusted here.
  private actorId(req: Request): string {
    return (req as any).user?.sub;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  create(@Body() createRoleDto: CreateRoleDto, @Req() req: Request) {
    return this.rolesService.create(createRoleDto, this.actorId(req));
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
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    return this.rolesService.update(id, updateRoleDto, this.actorId(req));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MANAGE_ROLES)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
