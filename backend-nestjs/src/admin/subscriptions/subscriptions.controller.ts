import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../roles/constants/permissions.constant';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';

@ApiTags('Admin / Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('v1/admin/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Listar todos los planes de suscripción' })
  @RequirePermissions(PERMISSIONS.MANAGE_TENANTS)
  async findAll() {
    return this.subscriptionsService.findAll();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Crear nuevo plan de suscripción' })
  @RequirePermissions(PERMISSIONS.MANAGE_TENANTS)
  async create(
    @Body() data: CreateSubscriptionPlanDto,
  ) {
    return this.subscriptionsService.create(data);
  }
}
