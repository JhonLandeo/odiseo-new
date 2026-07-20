import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ALL_MAPPED_QUESTION_LEVEL_IDS } from './constants/question-levels.constant';
import { IQuestionLevelReconciliationRepository } from './repositories/i-question-level-reconciliation.repository';

export interface QuestionLevelIdReconciliationResult {
  expectedCount: number;
  foundCount: number;
  missingIds: number[];
}

/**
 * Verifies that every level id hand-maintained in
 * `QUESTION_DIFFICULTY_MAPPING` (43-52) still exists in `odiseo.level`, the
 * question bank's own table (the SEPARATE `questionsConnection` datasource).
 *
 * WHY THIS CHECK EXISTS
 * ----------------------
 * `getLevelIdsForDifficulty` maps the string labels EASY/MEDIUM/HARD to raw
 * numeric ids that are real foreign keys into `odiseo.level(id, name)`
 * (confirmed via the `LEFT JOIN odiseo.level` in
 * `FlatQuestionsRepository.findByIdsFromNormalized`). This app has NO
 * compile-time knowledge of that external table's contents — the mapping is
 * a hand-maintained snapshot. If the question bank ever renumbers or removes
 * one of those ids, every query built from `flat-questions.repository.ts` /
 * `question-selection.strategy.ts` that filters `WHERE level_id IN (...)` for
 * that difficulty silently returns nothing for it — a difficulty tier goes
 * empty with zero error, zero exception, just a dry pool. Nobody auditing
 * this had a way to know without live DB access.
 *
 * This class closes that gap OPERATIONALLY, mirroring
 * `TopicIdSpaceReconciliationService`'s solution to the identical class of
 * problem for `odiseo.topic`: it runs inside the app, through the
 * `questionsConnection` DataSource the app already has configured, and
 * reports exactly which mapped ids (if any) are no longer present.
 *
 * UNLIKE the topic check, there is no fractional tolerance here: that check
 * accepts <100% overlap because the two catalogs sync on independent
 * schedules and a few topics lagging behind is expected steady-state drift.
 * `QUESTION_DIFFICULTY_MAPPING` is a small (10-id), hand-maintained,
 * point-in-time snapshot with no sync cadence of its own — there is no
 * "expected lag" for it. Any missing id is a hard failure by definition: that
 * exact id is baked into a `WHERE level_id IN (...)` predicate somewhere and
 * a missing id there is never "still converging", it is just wrong.
 *
 * This assumes `odiseo.level` rows are effectively immutable once created
 * (no soft-delete/renumber churn analogous to `odiseo.question`'s
 * `fl_status` flag — no such column is known to exist on `odiseo.level`).
 * If that assumption turns out to be wrong, every nightly run would FAIL on
 * benign churn with the same severity as a genuine removal; there is no
 * evidence either way in this codebase today, since nothing has queried
 * this table live before this check.
 */
@Injectable()
export class QuestionLevelIdReconciliationService {
  private readonly logger = new Logger(
    QuestionLevelIdReconciliationService.name,
  );

  constructor(
    @InjectEntityManager('questionsConnection')
    private readonly questionsManager: EntityManager,
    @Inject(IQuestionLevelReconciliationRepository)
    private readonly repository: IQuestionLevelReconciliationRepository,
  ) {}

  /**
   * Computes which mapped ids are missing and, if any are, logs a
   * `Logger.error` (a data-integrity finding, not a mere warning) naming them
   * exactly. Never throws — this is an observability check, not a
   * request-path gate, and must not crash the app.
   *
   * The result is also persisted durably (best-effort — a persistence
   * failure must never mask the check's own result or suppress the
   * `Logger.error` alert above), mirroring
   * `TopicIdSpaceReconciliationService.checkOverlap`'s bookkeeping.
   */
  async checkLevelIds(): Promise<QuestionLevelIdReconciliationResult> {
    const expectedIds = ALL_MAPPED_QUESTION_LEVEL_IDS;

    const rows = await this.questionsManager.query(
      'SELECT id, name FROM odiseo.level',
    );
    const foundIdSet = new Set<number>(rows.map((row: any) => Number(row.id)));

    const missingIds = expectedIds.filter((id) => !foundIdSet.has(id));
    const foundCount = expectedIds.length - missingIds.length;

    if (missingIds.length > 0) {
      this.logger.error(
        `Question-bank level id reconciliation FAILED: level id(s) ` +
          `[${missingIds.join(', ')}] referenced in QUESTION_DIFFICULTY_MAPPING ` +
          `no longer exist in odiseo.level (questionsConnection). Any ` +
          `difficulty tier mapped to a missing id will silently return an ` +
          `empty candidate pool — investigate and update ` +
          `question-levels.constant.ts before trusting difficulty filtering.`,
      );
    }

    await this.persistResult({
      outcome: missingIds.length === 0 ? 'PASS' : 'FAIL',
      expectedCount: expectedIds.length,
      foundCount,
      missingIds,
    });

    return { expectedCount: expectedIds.length, foundCount, missingIds };
  }

  /**
   * Bookkeeping write, never allowed to break the check itself or hide the
   * `Logger.error` alert above — same convention as
   * `TopicIdSpaceReconciliationService.persistResult`.
   */
  private async persistResult(record: {
    outcome: 'PASS' | 'FAIL';
    expectedCount: number;
    foundCount: number;
    missingIds: number[];
  }): Promise<void> {
    try {
      await this.repository.recordQuestionLevelReconciliation(record);
    } catch (error: any) {
      this.logger.error(
        `Failed to persist question-level id reconciliation result: ${error.message}`,
        error.stack,
      );
    }
  }
}
