import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublicCatalogs1718640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.courses (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.topics (
        id BIGINT PRIMARY KEY,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE public.subtopics (
        id BIGINT PRIMARY KEY,
        topic_id BIGINT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.subtopics;`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.topics;`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.courses;`);
  }
}
