import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialRequests1718640000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS material_requests (
        id UUID PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        profile_id UUID NOT NULL REFERENCES cycle_material_templates(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        material_type VARCHAR(50) NOT NULL DEFAULT 'BALOTARIO',
        version INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        requires_review BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS material_request_courses (
        id UUID PRIMARY KEY,
        material_request_id UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        download_url TEXT,
        warnings JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS material_review_questions (
        id UUID PRIMARY KEY,
        material_request_id UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
        question_id VARCHAR(36),
        topic_id BIGINT NOT NULL,
        subtopic_id BIGINT NOT NULL,
        position INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'FOUND',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS material_review_questions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS material_request_courses;`);
    await queryRunner.query(`DROP TABLE IF EXISTS material_requests;`);
  }
}
