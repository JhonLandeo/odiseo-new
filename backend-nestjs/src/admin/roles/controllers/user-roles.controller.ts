import { Controller, Put, Param, Body, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';
import { JwtAuthGuard } from '../../../auth/auth.guard';
import { AssignRolesDto } from '../dto/assign-roles.dto';
import { RolesService } from '../services/roles.service';

@Controller('v1/admin/users/:userId/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserRolesController {
  constructor(private readonly rolesService: RolesService) {}

  // JwtAuthGuard puts the verified JWT payload on the request; `sub` is the
  // acting user's id. The service re-reads that user's permissions from the
  // authoritative source, so nothing client-supplied is trusted here.
  private actorId(req: Request): string {
    return (req as any).user?.sub;
  }

  @Put()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async assignRoles(
    @Param('userId') userId: string,
    @Body() dto: AssignRolesDto,
    @Req() req: Request,
  ) {
    // MANAGE_USERS lets an actor manage assignments, but the roles they may
    // hand out are bounded by their own effective permissions: the service
    // rejects assigning any role that confers a permission the actor lacks
    // (e.g. Super Admin), closing the self-escalation path this endpoint used
    // to leave open.
    await this.rolesService.assignRolesToUser(
      this.actorId(req),
      userId,
      dto.role_ids ?? [],
    );

    return { success: true };
  }
}
