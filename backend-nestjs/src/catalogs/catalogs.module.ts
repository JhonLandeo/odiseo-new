import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogsController } from './catalogs.controller';
import { CatalogUseCase } from './catalog.use-case';
import { ICatalogRepository } from './repositories/i-catalog.repository';
import { CatalogRepositoryImpl } from './repositories/catalog.repository';
import { Course } from './entities/course.entity';
import { Topic } from './entities/topic.entity';
import { Subtopic } from './entities/subtopic.entity';
import { CatalogCronService } from './catalog.cron';

const providers: any[] = [
  CatalogUseCase,
  CatalogCronService,
  {
    provide: ICatalogRepository,
    useClass: CatalogRepositoryImpl,
  },
];

import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Topic, Subtopic]),
    ConfigModule,
    CacheModule.register({
      ttl: 60 * 10 * 1000, // 10 minutes default
    }),
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  controllers: [CatalogsController],
  providers,
})
export class CatalogsModule {}
