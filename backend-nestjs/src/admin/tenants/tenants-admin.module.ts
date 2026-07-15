import { Module, forwardRef } from '@nestjs/common';
import { TenantsAdminController } from './tenants-admin.controller';
import { TenantsAdminService } from './tenants-admin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../tenants/entities/tenant.entity';
import { TenantProvisioningListener } from './listeners/tenant-provisioning.listener';

import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    forwardRef(() => AuthModule),
  ],
  controllers: [TenantsAdminController],
  providers: [TenantsAdminService, TenantProvisioningListener],
})
export class TenantsAdminModule {}
