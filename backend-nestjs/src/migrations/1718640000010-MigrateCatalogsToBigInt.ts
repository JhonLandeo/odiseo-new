import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateCatalogsToBigInt1718640000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: If there is existing data with UUIDs, this will fail because UUID cannot be cast to BIGINT.
    // It assumes the catalog tables are empty or can be safely truncated in this environment.

    // 1. Drop constraints from tenant schemas (we iterate over them)
    const schemas = await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`,
    );

    for (const { schema_name } of schemas) {
      // Drop dependent FKs in tenant schema
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".tenant_topic_visibility DROP CONSTRAINT IF EXISTS "tenant_topic_visibility_topic_id_fkey"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".cycle_material_template_courses DROP CONSTRAINT IF EXISTS "cycle_material_template_courses_course_id_fkey"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus DROP CONSTRAINT IF EXISTS "syllabus_course_id_fkey"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution DROP CONSTRAINT IF EXISTS "syllabus_distribution_topic_id_fkey"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution DROP CONSTRAINT IF EXISTS "syllabus_distribution_subtopic_id_fkey"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_request_courses DROP CONSTRAINT IF EXISTS "material_request_courses_course_id_fkey"`,
      );

      // Alter columns in tenant schema
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".tenant_topic_visibility ALTER COLUMN topic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".cycle_material_template_courses ALTER COLUMN course_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus ALTER COLUMN course_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution ALTER COLUMN topic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution ALTER COLUMN subtopic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_request_courses ALTER COLUMN course_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_review_questions ALTER COLUMN topic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_review_questions ALTER COLUMN subtopic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_question_usage ALTER COLUMN course_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_question_usage ALTER COLUMN topic_id TYPE BIGINT USING NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_question_usage ALTER COLUMN subtopic_id TYPE BIGINT USING NULL`,
      );
    }

    // 2. Drop constraints in public schema
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.subtopics DROP CONSTRAINT IF EXISTS "subtopics_topic_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.topics DROP CONSTRAINT IF EXISTS "topics_course_id_fkey"`,
    );

    // 3. Alter columns in public schema
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.subtopics ALTER COLUMN id TYPE BIGINT USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.subtopics ALTER COLUMN topic_id TYPE BIGINT USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.topics ALTER COLUMN id TYPE BIGINT USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.topics ALTER COLUMN course_id TYPE BIGINT USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.courses ALTER COLUMN id TYPE BIGINT USING NULL`,
    );

    // 4. Re-add constraints in public schema
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.topics ADD CONSTRAINT "topics_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS public.subtopics ADD CONSTRAINT "subtopics_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE`,
    );

    // 5. Re-add constraints in tenant schemas
    for (const { schema_name } of schemas) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".tenant_topic_visibility ADD CONSTRAINT "tenant_topic_visibility_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".cycle_material_template_courses ADD CONSTRAINT "cycle_material_template_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus ADD CONSTRAINT "syllabus_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution ADD CONSTRAINT "syllabus_distribution_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".syllabus_distribution ADD CONSTRAINT "syllabus_distribution_subtopic_id_fkey" FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id) ON DELETE CASCADE`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "${schema_name}".material_request_courses ADD CONSTRAINT "material_request_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration down not strictly implemented for full safety given it's structural
  }
}
