import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterialTemplates1718640000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cycle_material_templates (
        id UUID PRIMARY KEY,
        cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        scope VARCHAR(50) NOT NULL,
        accumulation_weeks INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cycle_material_template_courses (
        id UUID PRIMARY KEY,
        template_id UUID NOT NULL REFERENCES cycle_material_templates(id) ON DELETE CASCADE,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        questions_quantity INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS cycle_material_template_courses;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS cycle_material_templates;`);
  }
}
