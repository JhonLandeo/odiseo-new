import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promotes the catalog sync state from a 10-minute cache entry to a durable
 * table. See CatalogSyncState for why: the cached value expired long before the
 * hourly sync refreshed it, so the freshness indicator the operator relies on
 * was blank most of the time and reset on every restart.
 */
export class CatalogSyncState1784200000000 implements MigrationInterface {
  name = 'CatalogSyncState1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "catalog_sync_state" ("source" character varying(100) NOT NULL, "last_attempt_at" TIMESTAMP WITH TIME ZONE, "last_success_at" TIMESTAMP WITH TIME ZONE, "last_outcome" character varying(20), "last_error" text, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_catalog_sync_state_source" PRIMARY KEY ("source"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "catalog_sync_state"`);
  }
}
