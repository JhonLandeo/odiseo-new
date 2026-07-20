import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QuestionLevelIdReconciliationService } from './question-level-id-reconciliation.service';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';
import type { DistributedLock } from '../common/locking/distributed-lock.interface';

/**
 * Cron wiring for `QuestionLevelIdReconciliationService`. See that class for
 * why the check exists; this class only owns the schedule + cross-replica
 * exclusion, mirroring `TopicIdSpaceCronService`'s lock pattern.
 */
@Injectable()
export class QuestionLevelIdReconciliationCronService {
  private readonly logger = new Logger(
    QuestionLevelIdReconciliationCronService.name,
  );

  /**
   * `QUESTION_DIFFICULTY_MAPPING` is a hand-maintained, point-in-time
   * snapshot, not something that changes on any schedule of its own — daily
   * is enough to catch a drift long before it goes unnoticed, mirroring
   * `TopicIdSpaceCronService.LOCK_TTL_MS`.
   */
  private static readonly LOCK_TTL_MS = 15 * 60 * 1000;

  private static readonly LOCK_KEY =
    'cron:question-bank:question-level-id-check';

  constructor(
    private readonly reconciliationService: QuestionLevelIdReconciliationService,
    @Inject(DISTRIBUTED_LOCK)
    private readonly lock: DistributedLock,
  ) {}

  // 02:20:00 daily — deliberately off every existing cron tick. Existing
  // schedules at the time this was added: CatalogCronService.syncCatalogs
  // (EVERY_HOUR, i.e. every hour at :00:00), ConsumptionMetricsCronService
  // (EVERY_HOUR), MaterialsCronService's midnight job
  // (EVERY_DAY_AT_MIDNIGHT, 00:00:00) and its `0 */15 * * * *` job (every
  // hour at :00/:15/:30/:45), and TopicIdSpaceCronService
  // (`0 15 1 * * *`, 01:15:00). Minute 20 falls on none of the 15-minute
  // marks, hour 2 collides with none of the above, so this tick never lands
  // on the same second as any of them (each cron already holds its own
  // DistributedLock key regardless, so this is about avoiding needless
  // simultaneous connection-pool pressure, not correctness).
  @Cron('0 20 2 * * *')
  async checkQuestionLevelIds() {
    // Every replica's scheduler fires this; without the lock N replicas would
    // run the same check concurrently for no benefit.
    await this.lock.runExclusively(
      QuestionLevelIdReconciliationCronService.LOCK_KEY,
      QuestionLevelIdReconciliationCronService.LOCK_TTL_MS,
      () => this.runCheck(),
    );
  }

  private async runCheck(): Promise<void> {
    this.logger.log(
      'Checking question-bank level id reconciliation against odiseo.level...',
    );
    try {
      await this.reconciliationService.checkLevelIds();
    } catch (error: any) {
      // The check's OWN queries failing (e.g. a connection outage) is
      // infrastructure noise, not the data-integrity finding this check
      // exists to surface — log it, but never let it crash the app.
      this.logger.error(
        `Question-level id check failed to run: ${error.message}`,
        error.stack,
      );
    }
  }
}
