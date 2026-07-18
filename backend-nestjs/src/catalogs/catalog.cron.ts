import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ICatalogRepository } from './repositories/i-catalog.repository';

@Injectable()
export class CatalogCronService {
  private readonly logger = new Logger(CatalogCronService.name);

  /**
   * Attempts per scheduled run. Deliberately small: the cron fires hourly, so
   * the schedule itself is the outer retry loop. These attempts exist to ride
   * out a transient blip (upstream restart, brief network fault) rather than to
   * survive a real outage — which is what the persisted failure state is for.
   */
  private static readonly MAX_ATTEMPTS = 3;

  /** Base backoff; attempt N waits N * this, so 1s, 2s. */
  private static readonly BACKOFF_BASE_MS = 1000;

  constructor(
    @Inject(ICatalogRepository)
    private readonly catalogRepository: ICatalogRepository,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * NOTE (known gap, intentionally out of scope here): this cron has no
   * distributed lock, so every replica fires it. It needs the same mechanism as
   * materials.cron.ts and should land as one change covering both.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async syncCatalogs() {
    this.logger.log('Starting sync of catalogs from Core API...');

    await this.safely(
      () => this.catalogRepository.recordSyncAttempt(),
      'record sync attempt',
    );

    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= CatalogCronService.MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        await this.fetchAndUpsert();
        await this.safely(
          () => this.catalogRepository.recordSyncSuccess(),
          'record sync success',
        );
        this.logger.log(
          'Successfully synchronized catalogs to the public schema.',
        );
        return;
      } catch (error: any) {
        lastError = error;
        const isLast = attempt === CatalogCronService.MAX_ATTEMPTS;
        this.logger.error(
          `Error during catalog sync (attempt ${attempt}/${CatalogCronService.MAX_ATTEMPTS}): ${error.message}`,
          error.stack,
        );
        if (!isLast) {
          await this.delay(attempt * CatalogCronService.BACKOFF_BASE_MS);
        }
      }
    }

    // Every attempt failed. Persist the reason so the outage is VISIBLE in the
    // product (and in the UI's sync status) instead of having to be inferred
    // from a `lastSyncedAt` that quietly stopped advancing.
    const message = (lastError as any)?.message ?? String(lastError);
    await this.safely(
      () => this.catalogRepository.recordSyncFailure(message),
      'record sync failure',
    );
  }

  private async fetchAndUpsert(): Promise<void> {
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

    // upsertCatalogs validates the payload before writing; an invalid one
    // throws and is treated exactly like a fetch failure.
    await this.catalogRepository.upsertCatalogs(response.data);
  }

  /**
   * Runs a bookkeeping write without letting it break the sync.
   *
   * Recording state must never be the reason a run fails: a successful catalog
   * write followed by a failed status write should still count as a success.
   */
  private async safely(
    operation: () => Promise<void>,
    description: string,
  ): Promise<void> {
    try {
      await operation();
    } catch (error: any) {
      this.logger.error(
        `Failed to ${description}: ${error.message}`,
        error.stack,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
