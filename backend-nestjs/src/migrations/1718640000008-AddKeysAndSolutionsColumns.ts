import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKeysAndSolutionsColumns1718640000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add columns to public.material_request_courses
    await queryRunner.query(`
      ALTER TABLE public.material_request_courses
        ADD COLUMN IF NOT EXISTS key_download_url TEXT,
        ADD COLUMN IF NOT EXISTS solution_download_url TEXT;
    `);

    // 2. Add columns to public.material_requests
    await queryRunner.query(`
      ALTER TABLE public.material_requests
        ADD COLUMN IF NOT EXISTS merged_key_download_url TEXT,
        ADD COLUMN IF NOT EXISTS merged_solution_download_url TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.material_requests
        DROP COLUMN IF EXISTS merged_solution_download_url,
        DROP COLUMN IF EXISTS merged_key_download_url;
    `);

    await queryRunner.query(`
      ALTER TABLE public.material_request_courses
        DROP COLUMN IF EXISTS solution_download_url,
        DROP COLUMN IF EXISTS key_download_url;
    `);
  }
}
