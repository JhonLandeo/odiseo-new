import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ConsumptionMetricsCron } from './consumption-metrics.cron';
import { ConsumptionMetric } from './entities/consumption-metric.entity';

import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsumptionMetric]),
    forwardRef(() => AuthModule),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, ConsumptionMetricsCron],
})
export class DashboardModule {}
