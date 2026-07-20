import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  IQuestionLevelReconciliationRepository,
  QuestionLevelReconciliationRecord,
} from './i-question-level-reconciliation.repository';
import { QUESTION_LEVEL_RECONCILIATION_STATE_ID } from '../entities/question-level-reconciliation-state.entity';

/**
 * Writes to `public.question_level_reconciliation_state` on the DEFAULT
 * connection — this is local platform state, not a query against the
 * external question bank, so it deliberately does NOT live on
 * `FlatQuestionsRepository` (which is the anti-corruption layer for
 * `odiseo.*` on `questionsConnection` and is read-only by design). Mirrors
 * `CatalogRepositoryImpl.recordTopicIdSpaceReconciliation`.
 */
@Injectable()
export class QuestionLevelReconciliationRepositoryImpl
  implements IQuestionLevelReconciliationRepository
{
  constructor(
    @InjectEntityManager()
    private readonly defaultManager: EntityManager,
  ) {}

  async recordQuestionLevelReconciliation(
    record: QuestionLevelReconciliationRecord,
  ): Promise<void> {
    await this.defaultManager.query(
      `INSERT INTO public.question_level_reconciliation_state
         (id, last_checked_at, last_outcome, last_expected_count,
          last_found_count, last_missing_ids, updated_at)
       VALUES ($1, now(), $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE
       SET last_checked_at = now(),
           last_outcome = EXCLUDED.last_outcome,
           last_expected_count = EXCLUDED.last_expected_count,
           last_found_count = EXCLUDED.last_found_count,
           last_missing_ids = EXCLUDED.last_missing_ids,
           updated_at = now()`,
      [
        QUESTION_LEVEL_RECONCILIATION_STATE_ID,
        record.outcome,
        record.expectedCount,
        record.foundCount,
        // `simple-array`'s on-disk representation is a plain comma-joined
        // string; empty array -> empty string (never NULL), consistent with
        // the entity's column type.
        record.missingIds.join(','),
      ],
    );
  }
}
