import { Module } from '@nestjs/common';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantsAdminModule } from './tenants/tenants-admin.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    SubscriptionsModule,
    TenantsAdminModule,
    DashboardModule,
  ],
})
export class AdminModule {}
