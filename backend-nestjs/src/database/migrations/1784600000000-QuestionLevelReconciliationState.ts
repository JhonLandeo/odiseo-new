import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable record of the question-level id reconciliation check's last run.
 * See QuestionLevelReconciliationState for why: QUESTION_DIFFICULTY_MAPPING
 * hand-maintains level ids (43-52) that are real foreign keys into the
 * EXTERNAL odiseo.level table (question-bank database) with zero
 * compile-time or FK-enforced link to it. A drifted/removed id previously had
 * no detection at all; this table lets the answer to "when did this last run,
 * and did it pass?" survive outside log retention.
 *
 * Public-schema, like TopicIdSpaceReconciliationState: platform-wide, not
 * per-tenant. Single-row by design (id is a fixed singleton, always 1).
 */
export class QuestionLevelReconciliationState1784600000000
  implements MigrationInterface
{
  name = 'QuestionLevelReconciliationState1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "question_level_reconciliation_state" ("id" smallint NOT NULL DEFAULT 1, "last_checked_at" TIMESTAMP WITH TIME ZONE, "last_outcome" character varying(20), "last_expected_count" integer, "last_found_count" integer, "last_missing_ids" text, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_question_level_reconciliation_state_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "question_level_reconciliation_state"`,
    );
  }
}
