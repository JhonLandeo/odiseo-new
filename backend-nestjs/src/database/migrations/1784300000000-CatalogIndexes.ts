import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the indexes the catalog read path relies on. `topics.course_id` and
 * `subtopics.topic_id` are the join/filter columns of getCourseTopics and
 * getCourses, yet the initial schema created only primary keys and foreign
 * keys — and Postgres does not auto-index a foreign-key column. Without these,
 * every catalog read sequentially scans the topics/subtopics tables.
 */
export class CatalogIndexes1784300000000 implements MigrationInterface {
  name = 'CatalogIndexes1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_topics_course_id" ON "public"."topics" ("course_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_subtopics_topic_id" ON "public"."subtopics" ("topic_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_subtopics_topic_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_topics_course_id"`,
    );
  }
}
