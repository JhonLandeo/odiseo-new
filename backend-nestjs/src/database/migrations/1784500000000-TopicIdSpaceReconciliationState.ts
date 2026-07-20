import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable record of the topic id-space reconciliation check's last run. See
 * TopicIdSpaceReconciliationState for why: a failing overlap ratio previously
 * only reached Logger.error, with no way to ask "when did this last run, and
 * did it pass?" outside of log retention.
 *
 * Public-schema, like CatalogSyncState: the check is platform-wide, not
 * per-tenant. Single-row by design (id is a fixed singleton, always 1) since
 * there is exactly one reconciliation check, unlike catalog_sync_state which
 * is keyed by source to allow more than one upstream catalog.
 */
export class TopicIdSpaceReconciliationState1784500000000
  implements MigrationInterface
{
  name = 'TopicIdSpaceReconciliationState1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "topic_id_space_reconciliation_state" ("id" smallint NOT NULL DEFAULT 1, "last_checked_at" TIMESTAMP WITH TIME ZONE, "last_overlap_ratio" double precision, "last_outcome" character varying(20), "last_core_topics_count" integer, "last_overlapping_topics_count" integer, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_topic_id_space_reconciliation_state_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "topic_id_space_reconciliation_state"`);
  }
}
