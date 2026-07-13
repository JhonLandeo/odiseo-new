import { Module } from '@nestjs/common';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TenantsAdminModule } from './tenants/tenants-admin.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [
    SubscriptionsModule,
    TenantsAdminModule,
    DashboardModule,
    RolesModule,
  ],
})
export class AdminModule {}
