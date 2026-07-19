import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { CatalogsController } from './catalogs.controller';
import { CatalogUseCase } from './catalog.use-case';
import { ICatalogRepository } from './repositories/i-catalog.repository';
import { CatalogRepositoryImpl } from './repositories/catalog.repository';
import { Course } from './entities/course.entity';
import { Topic } from './entities/topic.entity';
import { Subtopic } from './entities/subtopic.entity';
import { CatalogSyncState } from './entities/catalog-sync-state.entity';
import { CatalogCronService } from './catalog.cron';
import { TopicIdSpaceReconciliationService } from './topic-id-space-reconciliation.service';
import { TopicIdSpaceCronService } from './topic-id-space.cron';
import { AuthModule } from '../auth/auth.module';

const providers: any[] = [
  CatalogUseCase,
  CatalogCronService,
  TopicIdSpaceReconciliationService,
  TopicIdSpaceCronService,
  {
    provide: ICatalogRepository,
    useClass: CatalogRepositoryImpl,
  },
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Topic, Subtopic, CatalogSyncState]),
    ConfigModule,
    // Redis-backed, mirroring AuthModule. With the previous in-process store
    // every replica cached and invalidated independently: toggling a topic's
    // visibility on pod A left pods B..N serving the old counts for the full
    // TTL. Redis is already a hard dependency (BullMQ), so this adds no new
    // infrastructure. The version-stamped keys in CatalogUseCase rely on a
    // shared store to make invalidation global.
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST') || 'localhost';
        const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);
        return {
          ttl: 60 * 10 * 1000, // 10 minutes default
          stores: [
            new Keyv({
              store: new KeyvRedis(`redis://${host}:${port}`),
              // Namespaced so catalog entries cannot collide with the auth
              // permission cache sharing the same Redis database.
              namespace: 'catalogs',
            }),
          ],
        };
      },
    }),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
    // Required so JwtAuthGuard / PermissionsGuard can resolve AuthService.
    AuthModule,
  ],
  controllers: [CatalogsController],
  providers,
  exports: [
    // Consumed outside this module (SyllabusUseCase validates course
    // visibility before creating a syllabus).
    ICatalogRepository,
    // Exported so a future admin endpoint/CLI can trigger the id-space
    // reconciliation check on demand without waiting for its daily cron.
    TopicIdSpaceReconciliationService,
  ],
})
export class CatalogsModule {}
