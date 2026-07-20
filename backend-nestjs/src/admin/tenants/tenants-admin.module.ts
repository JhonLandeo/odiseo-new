import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TenantsAdminController } from './tenants-admin.controller';
import { TenantsAdminService } from './tenants-admin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../tenants/entities/tenant.entity';
import { TenantProvisioningProcessor } from './processors/tenant-provisioning.processor';
import { TenantAdminsController } from './tenant-admins.controller';
import { TenantAdminsService } from './tenant-admins.service';
import { DatabaseModule } from '../../database/database.module';
import { TenantsModule } from '../../tenants/tenants.module';

import { AuthModule } from '../../auth/auth.module';

// Invariant mirrored from materials.module.ts: heavy/background work must run
// outside the process that serves HTTP. When PROCESS_ROLE=api, the queue
// processor is NOT registered, so API nodes never provision tenant schemas;
// the separate worker entrypoint (worker.main.ts, PROCESS_ROLE=worker) owns
// processing. Default (unset) keeps both in one process for local/dev
// convenience.
const isApiOnly = process.env.PROCESS_ROLE === 'api';
const queueProcessors = isApiOnly ? [] : [TenantProvisioningProcessor];

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    forwardRef(() => AuthModule),
    DatabaseModule,
    TenantsModule,
    BullModule.registerQueue({
      name: 'tenant-provisioning-queue',
    }),
  ],
  controllers: [TenantsAdminController, TenantAdminsController],
  providers: [TenantsAdminService, TenantAdminsService, ...queueProcessors],
})
export class TenantsAdminModule {}
