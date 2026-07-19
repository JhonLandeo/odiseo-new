import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TopicIdSpaceReconciliationService } from './topic-id-space-reconciliation.service';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';
import type { DistributedLock } from '../common/locking/distributed-lock.interface';

/**
 * Cron wiring for `TopicIdSpaceReconciliationService`. See that class for
 * why the check exists; this class only owns the schedule + cross-replica
 * exclusion, mirroring `CatalogCronService`'s lock pattern.
 */
@Injectable()
export class TopicIdSpaceCronService {
  private readonly logger = new Logger(TopicIdSpaceCronService.name);

  /**
   * The two catalogs' id spaces are a slow-changing data contract, not
   * something that needs hourly checking like the Core API sync — daily is
   * enough to catch a drift long before it goes unnoticed.
   */
  private static readonly LOCK_TTL_MS = 15 * 60 * 1000;

  private static readonly LOCK_KEY = 'cron:catalogs:topic-id-space-check';

  constructor(
    private readonly reconciliationService: TopicIdSpaceReconciliationService,
    @Inject(DISTRIBUTED_LOCK)
    private readonly lock: DistributedLock,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkTopicIdSpace() {
    // Every replica's scheduler fires this; without the lock N replicas would
    // run the same two-database scan concurrently for no benefit.
    await this.lock.runExclusively(
      TopicIdSpaceCronService.LOCK_KEY,
      TopicIdSpaceCronService.LOCK_TTL_MS,
      () => this.runCheck(),
    );
  }

  private async runCheck(): Promise<void> {
    this.logger.log(
      'Checking topic id-space overlap between public.topics and the question bank...',
    );
    try {
      await this.reconciliationService.checkOverlap();
    } catch (error: any) {
      // The check's OWN queries failing (e.g. a connection outage) is
      // infrastructure noise, not the data-integrity finding this check
      // exists to surface — log it, but never let it crash the app.
      this.logger.error(
        `Topic id-space check failed to run: ${error.message}`,
        error.stack,
      );
    }
  }
}
