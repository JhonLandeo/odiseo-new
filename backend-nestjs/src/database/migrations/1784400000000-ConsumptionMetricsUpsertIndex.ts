import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `consumption_metrics` backs the ConsumptionMetric entity (spec 008 FR-007),
 * but no earlier migration ever created its table — the entity existed with
 * nothing behind it. This migration materializes the table (matching the
 * entity's exact column set) and adds the UNIQUE index the monthly collector
 * cron's upsert uses as its `ON CONFLICT` target: one row per tenant, per
 * metric type, per billing month/year (spec clarification "Opción B -
 * Mensual" — metrics are monthly accumulated per tenant, not append-only).
 */
export class ConsumptionMetricsUpsertIndex1784400000000 implements MigrationInterface {
  name = 'ConsumptionMetricsUpsertIndex1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."consumption_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "metric_type" character varying(100) NOT NULL,
        "value" bigint NOT NULL DEFAULT 0,
        "billing_month" integer NOT NULL,
        "billing_year" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumption_metrics_id" PRIMARY KEY ("id")
      )
    `);

    // FK located by a fixed name so re-running (IF NOT EXISTS on the table
    // above makes this idempotent-safe) finds and reuses it, mirroring the
    // companies -> subscription_plans FK style from InitialSchema.
    await queryRunner.query(`
      ALTER TABLE "public"."consumption_metrics"
      DROP CONSTRAINT IF EXISTS "FK_consumption_metrics_tenant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."consumption_metrics"
      ADD CONSTRAINT "FK_consumption_metrics_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_consumption_metrics_tenant_type_month_year"
      ON "public"."consumption_metrics" ("tenant_id", "metric_type", "billing_month", "billing_year")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."uq_consumption_metrics_tenant_type_month_year"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "public"."consumption_metrics"`,
    );
  }
}
