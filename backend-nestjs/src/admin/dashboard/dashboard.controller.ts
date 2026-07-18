import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../roles/constants/permissions.constant';

// Reads consumption metrics for an arbitrary tenant_id, so it is a platform-level
// operation and requires MANAGE_TENANTS. Without this any authenticated user
// could read any tenant's metrics.
@ApiTags('Admin / Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.MANAGE_TENANTS)
@Controller('v1/admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Obtener métricas consolidadas de consumo' })
  async getMetrics(
    @Query('tenant_id') tenantId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.dashboardService.getMetrics(tenantId, startDate, endDate);
  }
}
