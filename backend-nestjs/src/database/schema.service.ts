import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Creates a new PostgreSQL schema for a given tenant.
   * @param schemaName The name of the schema (typically the tenant's subdomain).
   */
  async createTenantSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Provisioning schema for tenant: ${schemaName}`);
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      // Here we could also run migrations programmatically if needed.
      this.logger.log(`Schema "${schemaName}" provisioned successfully`);
    } catch (error) {
      this.logger.error(`Error provisioning schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Creates the base tables and the first user for a newly provisioned tenant.
   */
  async seedTenantSchema(
    schemaName: string,
    companyId: string,
    adminEmail: string,
    adminPasswordHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Seeding tables and initial data for tenant: ${schemaName}`);

      // 1. Create base tables
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          company_id UUID NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          is_system_default BOOLEAN DEFAULT false,
          permissions JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".role_inheritance (
          parent_role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE RESTRICT,
          child_role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE CASCADE,
          PRIMARY KEY (parent_role_id, child_role_id)
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".user_roles (
          user_id UUID REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
          role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE RESTRICT,
          assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          PRIMARY KEY (user_id, role_id)
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".tenant_topic_visibility (
          topic_id BIGINT PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
          is_active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".cycles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          year INTEGER NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          days_per_week INTEGER NOT NULL DEFAULT 5,
          total_weeks INTEGER NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_demo BOOLEAN NOT NULL DEFAULT false,
          university_id UUID,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".cycle_weeks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
          week_number INTEGER NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".cycle_material_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          scope VARCHAR(50) NOT NULL,
          accumulation_weeks INTEGER,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".cycle_material_template_courses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          template_id UUID NOT NULL REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE CASCADE,
          course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
          questions_quantity INTEGER NOT NULL,
          easy_count INTEGER NOT NULL DEFAULT 0,
          medium_count INTEGER NOT NULL DEFAULT 0,
          hard_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".pdf_design_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          banner_image_url TEXT,
          watermark_image_url TEXT,
          cover_image_url TEXT,
          show_cover BOOLEAN NOT NULL DEFAULT false,
          primary_title_color VARCHAR(20) NOT NULL DEFAULT '2, 113, 184',
          secondary_title_color VARCHAR(20) NOT NULL DEFAULT '2, 113, 184',
          background_highlight_color VARCHAR(20) NOT NULL DEFAULT '214, 238, 253',
          margin_top VARCHAR(20) NOT NULL DEFAULT '3cm',
          margin_bottom VARCHAR(20) NOT NULL DEFAULT '1.5cm',
          margin_inside VARCHAR(20) NOT NULL DEFAULT '1cm',
          margin_outside VARCHAR(20) NOT NULL DEFAULT '1cm',
          is_book_mode BOOLEAN NOT NULL DEFAULT false,
          font_family VARCHAR(50) NOT NULL DEFAULT 'Arial',
          border_radius VARCHAR(20) NOT NULL DEFAULT '4px',
          content_font_size VARCHAR(20) NOT NULL DEFAULT '11pt',
          content_text_color VARCHAR(20) NOT NULL DEFAULT '#000000',
          blocks_config JSONB,
          header_config JSONB,
          footer_config JSONB,
          is_default BOOLEAN NOT NULL DEFAULT false,
          is_demo BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".syllabus (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
          course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          template_id UUID REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE SET NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_demo BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".syllabus_distribution (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          syllabus_id UUID NOT NULL REFERENCES "${schemaName}".syllabus(id) ON DELETE RESTRICT,
          template_id UUID REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE SET NULL,
          week_number INTEGER NOT NULL,
          topic_id BIGINT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
          subtopic_id BIGINT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
          question_count INTEGER NOT NULL CHECK (question_count > 0),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT UQ_syllabus_template_week_topic_subtopic UNIQUE (syllabus_id, template_id, week_number, topic_id, subtopic_id)
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".onboarding_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_dismissed BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".materials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          profile_id UUID NOT NULL REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE CASCADE,
          cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
          week_number INTEGER NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          latest_request_id UUID,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".material_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          profile_id UUID NOT NULL REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE CASCADE,
          cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
          week_number INTEGER NOT NULL,
          material_type VARCHAR(50) NOT NULL DEFAULT 'BALOTARIO',
          version INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          requires_review BOOLEAN NOT NULL DEFAULT true,
          design_template_id UUID REFERENCES "${schemaName}".pdf_design_templates(id) ON DELETE SET NULL,
          material_id UUID REFERENCES "${schemaName}".materials(id) ON DELETE CASCADE,
          merged_download_url TEXT,
          merged_key_download_url TEXT,
          merged_solution_download_url TEXT,
          created_by UUID,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        ALTER TABLE "${schemaName}".materials DROP CONSTRAINT IF EXISTS fk_materials_latest_request;
        ALTER TABLE "${schemaName}".materials
          ADD CONSTRAINT fk_materials_latest_request
          FOREIGN KEY (latest_request_id) REFERENCES "${schemaName}".material_requests(id) ON DELETE SET NULL;
        CREATE TABLE IF NOT EXISTS "${schemaName}".material_request_courses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          material_request_id UUID NOT NULL REFERENCES "${schemaName}".material_requests(id) ON DELETE CASCADE,
          course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          download_url TEXT,
          key_download_url TEXT,
          solution_download_url TEXT,
          warnings JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".material_review_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          material_request_id UUID NOT NULL REFERENCES "${schemaName}".material_requests(id) ON DELETE CASCADE,
          question_id VARCHAR(36),
          topic_id BIGINT NOT NULL,
          subtopic_id BIGINT NOT NULL,
          expected_level VARCHAR(20),
          position INTEGER NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'FOUND',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".material_question_usage (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          material_request_id UUID NOT NULL REFERENCES "${schemaName}".material_requests(id) ON DELETE CASCADE,
          cycle_id UUID NOT NULL,
          question_id VARCHAR(36) NOT NULL,
          course_id BIGINT NOT NULL,
          topic_id BIGINT NOT NULL,
          subtopic_id BIGINT NOT NULL,
          position_in_pdf INTEGER NOT NULL,
          was_replacement BOOLEAN NOT NULL DEFAULT false,
          used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_${schemaName}_material_question_usage_cycle_course_question
          ON "${schemaName}".material_question_usage (cycle_id, course_id, question_id);
      `);

      // 2. Insert Super Admin (Director) Role
      const superAdminPermsJSON = JSON.stringify([
        'view_catalogs',
        'edit_catalogs',
        'view_materials',
        'generate_material',
        'review_material',
        'view_syllabus',
        'edit_syllabus',
        'manage_academic_time',
      ]);
      const sysRoleRes = await queryRunner.query(`
        INSERT INTO "${schemaName}".roles (name, description, is_system_default, permissions) 
        VALUES ('Director', 'Administrador Principal de la Institución', true, $1::jsonb) RETURNING id;
      `, [superAdminPermsJSON]);
      const sysRoleId = sysRoleRes[0].id;

      // 3. Insert user
      const sysUserInsert = await queryRunner.query(
        `INSERT INTO "${schemaName}".users (email, password_hash, name, company_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [adminEmail, adminPasswordHash, 'Director General', companyId]
      );
      const sysUserId = sysUserInsert[0].id;

      // 4. Assign role
      await queryRunner.query(`INSERT INTO "${schemaName}".user_roles (user_id, role_id) VALUES ($1, $2)`, [sysUserId, sysRoleId]);

      this.logger.log(`Tenant "${schemaName}" seeded successfully`);
    } catch (error) {
      this.logger.error(`Error seeding schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
