/**
 * Ordered, append-only list of DDL migrations applied to EVERY tenant schema.
 *
 * This is the single source of truth for a tenant's physical structure.
 * Rules:
 *  - Never edit or reorder an existing migration once it has shipped; add a new
 *    one at the end instead.
 *  - Every statement must be idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`
 *    before `ADD`, etc.) so re-running the runner over an existing schema is safe.
 *  - `up(schema)` receives the already-validated schema name and returns the SQL.
 *
 * Migration 0001 reproduces, verbatim, the DDL that previously lived inline in
 * SchemaService.seedTenantSchema, so a freshly provisioned tenant is byte-for-byte
 * identical to the pre-refactor behavior.
 */
import { TENANT_SUPER_ADMIN_PERMISSIONS } from '../../admin/roles/constants/permissions.constant';

export interface TenantMigration {
  id: string;
  up: (schema: string) => string;
}

export const TENANT_MIGRATIONS: TenantMigration[] = [
  {
    id: '0001_initial_tenant_schema',
    up: (schema: string) => `
      CREATE TABLE IF NOT EXISTS "${schema}".users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        company_id UUID NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        is_system_default BOOLEAN DEFAULT false,
        permissions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".role_inheritance (
        parent_role_id UUID REFERENCES "${schema}".roles(id) ON DELETE RESTRICT,
        child_role_id UUID REFERENCES "${schema}".roles(id) ON DELETE CASCADE,
        PRIMARY KEY (parent_role_id, child_role_id)
      );
      CREATE TABLE IF NOT EXISTS "${schema}".user_roles (
        user_id UUID REFERENCES "${schema}".users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES "${schema}".roles(id) ON DELETE RESTRICT,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        PRIMARY KEY (user_id, role_id)
      );
      CREATE TABLE IF NOT EXISTS "${schema}".tenant_topic_visibility (
        topic_id BIGINT PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".cycles (
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
      CREATE TABLE IF NOT EXISTS "${schema}".cycle_weeks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID NOT NULL REFERENCES "${schema}".cycles(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        deleted_at TIMESTAMP WITH TIME ZONE
      );
      CREATE TABLE IF NOT EXISTS "${schema}".cycle_material_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID NOT NULL REFERENCES "${schema}".cycles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        scope VARCHAR(50) NOT NULL,
        accumulation_weeks INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".cycle_material_template_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES "${schema}".cycle_material_templates(id) ON DELETE CASCADE,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        questions_quantity INTEGER NOT NULL,
        easy_count INTEGER NOT NULL DEFAULT 0,
        medium_count INTEGER NOT NULL DEFAULT 0,
        hard_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".pdf_design_templates (
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
      CREATE TABLE IF NOT EXISTS "${schema}".syllabus (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID NOT NULL REFERENCES "${schema}".cycles(id) ON DELETE CASCADE,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        template_id UUID REFERENCES "${schema}".cycle_material_templates(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".syllabus_distribution (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        syllabus_id UUID NOT NULL REFERENCES "${schema}".syllabus(id) ON DELETE RESTRICT,
        template_id UUID REFERENCES "${schema}".cycle_material_templates(id) ON DELETE SET NULL,
        week_number INTEGER NOT NULL,
        topic_id BIGINT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
        subtopic_id BIGINT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
        question_count INTEGER NOT NULL CHECK (question_count > 0),
        is_generated BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT UQ_syllabus_template_week_topic_subtopic UNIQUE (syllabus_id, template_id, week_number, topic_id, subtopic_id)
      );
      CREATE TABLE IF NOT EXISTS "${schema}".onboarding_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_dismissed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".materials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        profile_id UUID NOT NULL REFERENCES "${schema}".cycle_material_templates(id) ON DELETE CASCADE,
        cycle_id UUID NOT NULL REFERENCES "${schema}".cycles(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        latest_request_id UUID,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".material_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        profile_id UUID NOT NULL REFERENCES "${schema}".cycle_material_templates(id) ON DELETE CASCADE,
        cycle_id UUID NOT NULL REFERENCES "${schema}".cycles(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        material_type VARCHAR(50) NOT NULL DEFAULT 'BALOTARIO',
        version INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        requires_review BOOLEAN NOT NULL DEFAULT true,
        design_template_id UUID REFERENCES "${schema}".pdf_design_templates(id) ON DELETE SET NULL,
        material_id UUID REFERENCES "${schema}".materials(id) ON DELETE CASCADE,
        merged_download_url TEXT,
        merged_key_download_url TEXT,
        merged_solution_download_url TEXT,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      ALTER TABLE "${schema}".materials DROP CONSTRAINT IF EXISTS fk_materials_latest_request;
      ALTER TABLE "${schema}".materials
        ADD CONSTRAINT fk_materials_latest_request
        FOREIGN KEY (latest_request_id) REFERENCES "${schema}".material_requests(id) ON DELETE SET NULL;
      CREATE TABLE IF NOT EXISTS "${schema}".material_request_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_request_id UUID NOT NULL REFERENCES "${schema}".material_requests(id) ON DELETE CASCADE,
        course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        download_url TEXT,
        key_download_url TEXT,
        solution_download_url TEXT,
        warnings JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".material_review_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_request_id UUID NOT NULL REFERENCES "${schema}".material_requests(id) ON DELETE CASCADE,
        question_id VARCHAR(36),
        topic_id BIGINT NOT NULL,
        subtopic_id BIGINT NOT NULL,
        expected_level VARCHAR(20),
        position INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'FOUND',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schema}".material_question_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_request_id UUID NOT NULL REFERENCES "${schema}".material_requests(id) ON DELETE CASCADE,
        cycle_id UUID NOT NULL,
        question_id VARCHAR(36) NOT NULL,
        course_id BIGINT NOT NULL,
        topic_id BIGINT NOT NULL,
        subtopic_id BIGINT NOT NULL,
        position_in_pdf INTEGER NOT NULL,
        was_replacement BOOLEAN NOT NULL DEFAULT false,
        used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_question_usage_cycle_course_question"
        ON "${schema}".material_question_usage (cycle_id, course_id, question_id);
    `,
  },
  {
    id: '0002_material_request_indexes',
    up: (schema: string) => `
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_requests_cycle_week"
        ON "${schema}".material_requests (cycle_id, week_number);
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_requests_status"
        ON "${schema}".material_requests (status);
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_requests_material_id"
        ON "${schema}".material_requests (material_id);
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_request_courses_request"
        ON "${schema}".material_request_courses (material_request_id);
      CREATE INDEX IF NOT EXISTS "idx_${schema}_material_review_questions_request"
        ON "${schema}".material_review_questions (material_request_id);
    `,
  },
  {
    // Reconcile the system-default Super Admin role to the canonical UPPERCASE
    // permission vocabulary enforced by PermissionsGuard. Earlier tenants were
    // seeded with a stale lowercase set (view_syllabus, generate_material, …)
    // that the guard does not recognize, which would lock them out once
    // permission checks are enforced. Idempotent: sets a fixed value.
    id: '0003_reconcile_super_admin_permissions',
    up: (schema: string) => `
      UPDATE "${schema}".roles
      SET permissions = '${JSON.stringify(TENANT_SUPER_ADMIN_PERMISSIONS)}'::jsonb,
          updated_at = now()
      WHERE is_system_default = true;
    `,
  },
  {
    // Turns three invariants that were only enforced by application code into
    // database constraints, and stops one shared-catalogue delete from erasing
    // authored tenant data.
    //
    // Why each uniqueness rule is scoped the way it is:
    //
    //  - syllabus (cycle_id, course_id) is PARTIAL on `is_active = true`,
    //    because that is exactly the predicate the application's own duplicate
    //    check uses (SyllabusUseCase.create -> findByCourseAndCycle filters
    //    is_active: true). A full unique index would additionally forbid
    //    archiving a syllabus and creating a fresh one for the same course —
    //    a legitimate flow the product supports. The constraint therefore
    //    mirrors the rule the code already intends, no more.
    //
    //  - cycle_weeks (cycle_id, week_number) is PARTIAL on
    //    `deleted_at IS NULL`, because weeks are SOFT deleted. Shrinking a
    //    cycle's totalWeeks soft-deletes the trailing weeks; growing it again
    //    re-inserts those week numbers. A full unique index would collide with
    //    the tombstones and break that flow outright. Only live weeks must be
    //    unique.
    //
    //  - onboarding_progress is a singleton per tenant schema. Postgres has no
    //    "at most one row" constraint, so it is expressed as a fixed-true
    //    column with a CHECK plus a UNIQUE index. That gives the row a stable
    //    conflict target, which is what lets OnboardingService drop its
    //    cooperative advisory lock for a real INSERT ... ON CONFLICT.
    //
    // Cross-schema FKs: `ON DELETE CASCADE` from public.courses / topics /
    // subtopics into tenant tables means deleting one row from the SHARED
    // catalogue silently deletes authored planning data in EVERY tenant. It is
    // latent only because the catalogue sync upserts and never deletes. These
    // become RESTRICT so such a delete fails loudly instead. The one deliberate
    // exception is tenant_topic_visibility: its rows are pure per-topic
    // override flags with no meaning once the topic is gone, so cascading is
    // the correct semantics there and it is left alone.
    id: '0004_tenant_integrity_constraints',
    up: (schema: string) => `
      -- ── Uniqueness ────────────────────────────────────────────────────────
      -- Deliberately NOT prefixed with the schema name, unlike the \`idx_\` names
      -- in 0001/0002. Indexes already live in the schema's own namespace, and
      -- "uq_" + a 36-char tenant UUID leaves only ~16 chars before Postgres
      -- truncates the identifier at 63 — which for a UNIQUE index would risk
      -- two different constraints colliding into one name. Matches how 0001
      -- names UQ_syllabus_template_week_topic_subtopic.
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_syllabus_cycle_course_active"
        ON "${schema}".syllabus (cycle_id, course_id)
        WHERE is_active = true;

      CREATE UNIQUE INDEX IF NOT EXISTS "uq_cycle_weeks_cycle_week_live"
        ON "${schema}".cycle_weeks (cycle_id, week_number)
        WHERE deleted_at IS NULL;

      -- Singleton onboarding row. The column is always true, so the unique
      -- index over it admits exactly one row per schema.
      ALTER TABLE "${schema}".onboarding_progress
        ADD COLUMN IF NOT EXISTS singleton BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE "${schema}".onboarding_progress
        DROP CONSTRAINT IF EXISTS chk_onboarding_progress_singleton;
      ALTER TABLE "${schema}".onboarding_progress
        ADD CONSTRAINT chk_onboarding_progress_singleton CHECK (singleton);
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_progress_singleton"
        ON "${schema}".onboarding_progress (singleton);

      -- steps_completed is vestigial: nothing writes it and nothing reads it.
      -- Step completion is derived from the real tables on every request.
      ALTER TABLE "${schema}".onboarding_progress
        DROP COLUMN IF EXISTS steps_completed;

      -- ── Cross-schema FK hardening ─────────────────────────────────────────
      -- The 0001 FKs were created inline and carry server-generated names, so
      -- they are located by shape (table + column + referenced table) rather
      -- than by a name this migration cannot know. Re-running is safe: the
      -- lookup only matches constraints that are still CASCADE.
      DO $do$
      DECLARE
        target RECORD;
        constraint_name TEXT;
      BEGIN
        FOR target IN
          SELECT * FROM (VALUES
            ('syllabus', 'course_id', 'courses'),
            ('syllabus_distribution', 'topic_id', 'topics'),
            ('syllabus_distribution', 'subtopic_id', 'subtopics'),
            ('cycle_material_template_courses', 'course_id', 'courses'),
            ('material_request_courses', 'course_id', 'courses')
          ) AS t(table_name, column_name, referenced_table)
        LOOP
          SELECT con.conname INTO constraint_name
          FROM pg_constraint con
          JOIN pg_class child ON child.oid = con.conrelid
          JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
          JOIN pg_class parent ON parent.oid = con.confrelid
          JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
          WHERE con.contype = 'f'
            AND con.confdeltype = 'c'  -- only the CASCADE ones still need fixing
            AND child_ns.nspname = '${schema}'
            AND child.relname = target.table_name
            AND parent_ns.nspname = 'public'
            AND parent.relname = target.referenced_table
            AND con.conkey = ARRAY[(
              SELECT attnum FROM pg_attribute
              WHERE attrelid = child.oid AND attname = target.column_name
            )]::smallint[]
          LIMIT 1;

          IF constraint_name IS NOT NULL THEN
            EXECUTE format(
              'ALTER TABLE %I.%I DROP CONSTRAINT %I',
              '${schema}', target.table_name, constraint_name
            );
            EXECUTE format(
              'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
              'REFERENCES public.%I(id) ON DELETE RESTRICT',
              '${schema}', target.table_name, constraint_name,
              target.column_name, target.referenced_table
            );
          END IF;
        END LOOP;
      END
      $do$;
    `,
  },
];
