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

@Module({
  imports: [
    AdminModule,
    GcsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    ScheduleModule.forRoot(),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
