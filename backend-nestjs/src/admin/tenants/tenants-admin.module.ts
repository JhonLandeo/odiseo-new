import { Module, forwardRef } from '@nestjs/common';
import { TenantsAdminController } from './tenants-admin.controller';
import { TenantsAdminService } from './tenants-admin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../tenants/entities/tenant.entity';
import { TenantProvisioningListener } from './listeners/tenant-provisioning.listener';
import { TenantAdminsController } from './tenant-admins.controller';
import { TenantAdminsService } from './tenant-admins.service';
import { DatabaseModule } from '../../database/database.module';
import { TenantsModule } from '../../tenants/tenants.module';

import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    forwardRef(() => AuthModule),
    DatabaseModule,
    TenantsModule,
  ],
  controllers: [TenantsAdminController, TenantAdminsController],
  providers: [
    TenantsAdminService,
    TenantAdminsService,
    TenantProvisioningListener,
  ],
})
export class TenantsAdminModule {}
