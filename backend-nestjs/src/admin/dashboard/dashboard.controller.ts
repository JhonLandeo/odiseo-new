import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../auth/auth.guard';

@ApiTags('Admin / Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
