import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ICatalogRepository } from './repositories/i-catalog.repository';

const LAST_SYNC_CACHE_KEY = 'catalogs:last-synced-at';

@Injectable()
export class CatalogCronService {
  private readonly logger = new Logger(CatalogCronService.name);

  constructor(
    @Inject(ICatalogRepository)
    private readonly catalogRepository: ICatalogRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncCatalogs() {
    this.logger.log('Starting sync of catalogs from Core API...');
    try {
      const coreApiUrl =
        this.configService.get<string>('CORE_API_URL') ||
        'http://localhost:3000/api/catalogs';

      const response: any = await lastValueFrom(
        this.httpService.get(coreApiUrl, {
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

      const payload = response.data;

      await this.catalogRepository.upsertCatalogs(payload);
      await this.cacheManager.set(
        LAST_SYNC_CACHE_KEY,
        new Date().toISOString(),
      );

      this.logger.log(
        'Successfully synchronized catalogs to the public schema.',
      );
    } catch (error: any) {
      this.logger.error(
        `Error during catalog sync: ${error.message}`,
        error.stack,
      );
    }
  }
}
