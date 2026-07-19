import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { DatabaseModule } from './database/database.module';
import { ClsModule } from 'nestjs-cls';
import { ConfigModule } from '@nestjs/config';
import {
  envValidationSchema,
  envValidationOptions,
} from './config/env.validation';
import { BullModule } from '@nestjs/bullmq';
import { TenantMiddleware } from './database/tenant.middleware';
import { CatalogsModule } from './catalogs/catalogs.module';
import { AcademicTimeModule } from './academic-time/academic-time.module';
import { SyllabusModule } from './syllabus/syllabus.module';
import { MaterialsModule } from './materials/materials.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { GcsModule } from './gcs/gcs.module';
import { AdminModule } from './admin/admin.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LockingModule } from './common/locking/locking.module';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './auth/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PasswordResetGuard } from './common/guards/password-reset.guard';
import { QueueDashboardAuthMiddleware } from './common/middleware/queue-dashboard-auth.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AdminModule,
    GcsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: envValidationOptions,
    }),
    // The `middleware` option is applied by BullBoardRootModule immediately
    // BEFORE the dashboard router (see its configure()), which is the only hook
    // that can protect it: the router is raw Express middleware, so the global
    // APP_GUARD chain never sees /queues.
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
      middleware: QueueDashboardAuthMiddleware,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    ScheduleModule.forRoot(),
    // Global. The @Cron jobs live in their own feature modules (catalog.cron.ts,
    // materials.cron.ts, consumption-metrics.cron.ts, topic-id-space.cron.ts,
    // not here), but each fires in every replica and needs the same
    // cross-replica exclusion, so the lock is provided once at the root.
    LockingModule,
    EventEmitterModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    DatabaseModule,
    AuthModule,
    TenantsModule,
    CatalogsModule,
    AcademicTimeModule,
    SyllabusModule,
    MaterialsModule,
    QuestionBankModule,
    OnboardingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Security is deny-by-default: every route requires a valid JWT unless it
    // is explicitly marked @Public(). Order matters — JwtAuthGuard must run
    // first because the two guards after it read request.user, which only
    // exists after JwtAuthGuard has populated it.
    //
    // PasswordResetGuard sits BEFORE PermissionsGuard on purpose. An account
    // under force_password_reset is suspended outright, so the answer must be
    // the same machine-readable "change your password" for every route it
    // touches. Behind PermissionsGuard the answer would instead depend on which
    // permission the route happens to require: routes the user is not entitled
    // to would return a bare 403 the frontend cannot act on, and the user would
    // be told the wrong thing about why they are blocked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordResetGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Global error normalization. Registered as an APP_FILTER (not via
    // useGlobalFilters in main.ts) so it participates in the DI container and
    // wraps the guard chain above: the guards' HttpExceptions pass through
    // untouched, while unexpected errors are logged and redacted to a stable
    // 500 instead of leaking internals.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
