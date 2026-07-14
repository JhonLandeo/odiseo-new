import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantAcademicTime1718640000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenant_topic_visibility (
        topic_id BIGINT PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE cycles (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_per_week INTEGER NOT NULL,
        total_weeks INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        university_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        deleted_by UUID
      );
    `);

    await queryRunner.query(`
      CREATE TABLE cycle_weeks (
        id UUID PRIMARY KEY,
        cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        deleted_by UUID
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cycle_weeks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS cycles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_topic_visibility;`);
  }
}
