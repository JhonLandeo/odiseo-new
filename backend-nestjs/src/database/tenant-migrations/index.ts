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
      -- A schema provisioned before this migration could already hold more than
      -- one row (the old advisory-lock upsert had no unique constraint to lean
      -- on). The UNIQUE index below would then fail and roll back the whole
      -- migration, bricking provisioning. Collapse to a single row first,
      -- keeping the earliest by (created_at ASC, id ASC) — the exact row
      -- OnboardingService already resolves to on read. Idempotent: a single-row
      -- or empty table deletes nothing.
      DELETE FROM "${schema}".onboarding_progress
      WHERE id NOT IN (
        SELECT id FROM "${schema}".onboarding_progress
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      );
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
  {
    // AC-016: a password chosen by anyone other than the account owner (the
    // seed, an operator resetting credentials, an admin creating or overwriting
    // another admin's password) is a shared secret until the owner replaces it.
    // The flag records that debt on the account itself so enforcement is
    // server-side and survives any client.
    //
    // NOT NULL DEFAULT false is the safe default for the rows that already
    // exist: their owners chose their own passwords, so backfilling `true`
    // would lock out every current user of every tenant on deploy.
    id: '0005_users_force_password_reset',
    up: (schema: string) => `
      ALTER TABLE "${schema}".users
        ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    // Turns two more application-only invariants into database constraints. No
    // production data exists yet, so adding them as plain unique indexes over
    // the current rows is safe. Both statements are idempotent.
    //
    //  - materials (tenant_id, profile_id, week_number) is UNIQUE. A Material is
    //    the single parent row for a given profile and week. GenerateMaterialUseCase
    //    does a read-then-insert find-or-create on exactly this triple, with no
    //    constraint behind it — so two concurrent generations for the same
    //    profile/week (two POST /generate, or the daily cron racing a manual
    //    generate) could both read "no material" and both INSERT, leaving two
    //    parent rows each pointing at its own latest_request_id. The unique
    //    index makes the duplicate impossible and gives the use-case's
    //    INSERT ... ON CONFLICT DO NOTHING a conflict target. tenant_id is
    //    constant within a schema, but the index mirrors the exact columns the
    //    code queries by (findOne where { tenantId, profileId, weekNumber }) so
    //    the constraint and the query agree.
    //
    //  - pdf_design_templates (tenant_id) WHERE is_default = true is PARTIAL
    //    UNIQUE: at most one default design per tenant. This was declared only
    //    on the entity (@Index('idx_tenant_default', …)) and never reached
    //    provisioned tenant schemas, so a concurrent "set default" could create
    //    two. The index name matches the entity's exactly so the two never
    //    collide into duplicate definitions.
    id: '0006_material_and_default_design_uniqueness',
    up: (schema: string) => `
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_materials_tenant_profile_week"
        ON "${schema}".materials (tenant_id, profile_id, week_number);

      CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_default"
        ON "${schema}".pdf_design_templates (tenant_id)
        WHERE is_default = true;
    `,
  },
  {
    // Onboarding tour dismissal becomes PER-USER instead of a per-tenant
    // singleton. Product decision: each user sees the tour until THEY dismiss
    // it, rather than one user's dismissal hiding it for the whole institution.
    //
    // Only the `is_dismissed` flag becomes per-user. Step completion stays
    // tenant-level: it is still derived from the tenant tables on every request
    // (see OnboardingService), because it reflects the INSTITUTION's setup and
    // is identical for every user of the tenant.
    //
    // The existing rows are per-tenant dismissal flags with no user attribution,
    // so there is no correct user to backfill them onto. With no production data
    // they are simply deleted; a user just sees the tour once more. Because the
    // runner records a migration only after its transaction commits, this DELETE
    // executes exactly once per schema — it never wipes real per-user rows.
    //
    // FK to "${schema}".users(id) ON DELETE CASCADE is safe and desirable:
    // onboarding always runs in tenant context (runInTenant), and JwtAuthGuard
    // rejects any request whose token companyId does not match the resolved
    // tenant, so the caller's req.user.sub is always a user of THIS schema.
    // Cascade drops a user's dismissal row when the user is deleted.
    id: '0007_onboarding_progress_per_user',
    up: (schema: string) => `
      -- Reset the per-tenant dismissal flags: they carry no user attribution and
      -- cannot be mapped onto a specific user. Runs once per schema.
      DELETE FROM "${schema}".onboarding_progress;

      -- Drop the singleton machinery introduced in 0004.
      DROP INDEX IF EXISTS "${schema}"."uq_onboarding_progress_singleton";
      ALTER TABLE "${schema}".onboarding_progress
        DROP CONSTRAINT IF EXISTS chk_onboarding_progress_singleton;
      ALTER TABLE "${schema}".onboarding_progress
        DROP COLUMN IF EXISTS singleton;

      -- One dismissal row per user. The table was emptied above, so adding a
      -- NOT NULL column violates nothing.
      ALTER TABLE "${schema}".onboarding_progress
        ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL;

      -- FK is safe: see the migration's rationale comment. Located by a fixed
      -- name so re-running finds and reuses it.
      ALTER TABLE "${schema}".onboarding_progress
        DROP CONSTRAINT IF EXISTS fk_onboarding_progress_user;
      ALTER TABLE "${schema}".onboarding_progress
        ADD CONSTRAINT fk_onboarding_progress_user
        FOREIGN KEY (user_id) REFERENCES "${schema}".users(id) ON DELETE CASCADE;

      -- At most one dismissal row per user, and the conflict target for the
      -- service's INSERT ... ON CONFLICT (user_id) upsert.
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_progress_user"
        ON "${schema}".onboarding_progress (user_id);
    `,
  },
  {
    // FK-side btree indexes for the joins the hot paths actually run:
    //
    //  - role_inheritance(child_role_id): every permission resolution walks the
    //    hierarchy child -> parent (see flattened-permissions.query.ts), and
    //    the write-time cycle guard does the same; only (parent, child) is
    //    indexed by the 0001 primary key, so each recursion step scanned.
    //  - user_roles(role_id): the invalidation fan-out and the admin listings
    //    join user_roles by role, but the 0001 primary key leads with user_id.
    //  - syllabus(cycle_id), cycle_material_templates(cycle_id),
    //    cycle_material_template_courses(template_id): child-side FK joins the
    //    planning and generation reads filter by, with no covering index.
    //
    // Names are deliberately unprefixed, following 0004/0006 rather than the
    // idx_${schema} pattern of 0001/0002: indexes already live in the schema's
    // namespace, and the 43-char "idx_tenant_<uuid>_" prefix would push two of
    // these names past Postgres's 63-char identifier limit, truncating them
    // into the SAME identifier — so the second CREATE INDEX IF NOT EXISTS
    // would silently never run.
    id: '0008_fk_join_indexes',
    up: (schema: string) => `
      CREATE INDEX IF NOT EXISTS "idx_role_inheritance_child_role_id"
        ON "${schema}".role_inheritance (child_role_id);
      CREATE INDEX IF NOT EXISTS "idx_user_roles_role_id"
        ON "${schema}".user_roles (role_id);
      CREATE INDEX IF NOT EXISTS "idx_syllabus_cycle_id"
        ON "${schema}".syllabus (cycle_id);
      CREATE INDEX IF NOT EXISTS "idx_cycle_material_templates_cycle_id"
        ON "${schema}".cycle_material_templates (cycle_id);
      CREATE INDEX IF NOT EXISTS "idx_cycle_material_template_courses_template_id"
        ON "${schema}".cycle_material_template_courses (template_id);
    `,
  },
  {
    // material_question_usage (material_request_id, course_id, question_id) is
    // the table's natural key: the anti-repetition ledger records each question
    // AT MOST ONCE per generated course of a request (the writer clears exactly
    // that scope before re-inserting on a regeneration). Only application code
    // enforced it, so a duplicated question in a generation payload — or a
    // crash-retry interleaving — could double-count usage and skew both the
    // exclusion list and the dashboard's questions_used metric. The index also
    // gives the writer's INSERT ... ON CONFLICT DO NOTHING (orIgnore) its
    // conflict target; a raised 23505 would poison the surrounding runInTenant
    // transaction. NOT (cycle_id, course_id, question_id): a new version of a
    // request in the same cycle/week legitimately re-uses questions of its
    // predecessor, so per-cycle uniqueness would be wrong.
    //
    // Rows that already violate the key are collapsed FIRST, keeping the
    // earliest by (used_at ASC, id ASC) — the 0004 dedup precedent — because a
    // failing CREATE UNIQUE INDEX would roll back the whole migration and brick
    // provisioning. Name is unprefixed, following 0004/0006/0008 (63-char
    // identifier limit).
    id: '0009_material_question_usage_natural_key',
    up: (schema: string) => `
      DELETE FROM "${schema}".material_question_usage
      WHERE id NOT IN (
        SELECT DISTINCT ON (material_request_id, course_id, question_id) id
        FROM "${schema}".material_question_usage
        ORDER BY material_request_id, course_id, question_id,
                 used_at ASC, id ASC
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_material_question_usage_request_course_question"
        ON "${schema}".material_question_usage (material_request_id, course_id, question_id);
    `,
  },
  {
    // Billing pipeline (spec 008 FR-007): the cheapest correct source of truth
    // for PDF page counts and artifact byte sizes is the moment the PDF is
    // generated — the processor already holds the finished Buffer in memory
    // right before uploading it, so no extra S3 read or separate scan is
    // needed. Both columns are nullable: pre-existing rows (generated before
    // this migration) and rows for non-success terminal states (failed,
    // empty_bank) never get a value, and the monthly collector cron already
    // treats a NULL page_count/file_size_bytes as 0 via COALESCE(SUM(...), 0).
    id: '0010_material_request_course_pdf_metrics',
    up: (schema: string) => `
      ALTER TABLE "${schema}".material_request_courses
        ADD COLUMN IF NOT EXISTS page_count INTEGER,
        ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
        -- Set alongside page_count/file_size_bytes in the same webhook
        -- transaction, when the course reaches a success-terminal state.
        -- created_at (request-submission time) is the wrong column for the
        -- monthly collector to scope pdf_pages_generated by: a course
        -- created near a month boundary whose generation finishes in the
        -- FOLLOWING month would never be counted in either month's bucket.
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `,
  },
  {
    // UQ_syllabus_template_week_topic_subtopic (0001) is a plain-column
    // UNIQUE(syllabus_id, template_id, week_number, topic_id, subtopic_id).
    // Postgres treats NULL as distinct from NULL for uniqueness, so two rows
    // sharing the same (syllabus_id, week_number, topic_id, subtopic_id) with
    // BOTH template_id IS NULL never collide -- the INSERT never raises
    // 23505, so SyllabusRepositoryImpl.createDistribution's catch-and-
    // overwrite Last-Write-Wins logic is silently never triggered for that
    // case and duplicate cells accumulate instead of the intended overwrite.
    //
    // Fixed with a NULL-safe expression index over
    // COALESCE(template_id, <sentinel>) in place of the raw column.
    // Expression indexes work on any Postgres version this repo targets
    // (unlike `UNIQUE NULLS NOT DISTINCT`, which needs PG15+). The sentinel
    // is the nil UUID -- it can never collide with a real
    // cycle_material_templates.id (a v4/gen_random_uuid() primary key never
    // generates the all-zero UUID).
    //
    // Rows that already violate the NULL-safe key are collapsed FIRST,
    // keeping the earliest by (created_at ASC, id ASC) -- the 0004/0009 dedup
    // precedent -- because a failing CREATE UNIQUE INDEX would roll back the
    // whole migration and brick provisioning.
    id: '0011_syllabus_distribution_null_safe_unique',
    up: (schema: string) => `
      DELETE FROM "${schema}".syllabus_distribution
      WHERE id NOT IN (
        SELECT DISTINCT ON (
          syllabus_id,
          COALESCE(template_id, '00000000-0000-0000-0000-000000000000'::uuid),
          week_number, topic_id, subtopic_id
        ) id
        FROM "${schema}".syllabus_distribution
        ORDER BY
          syllabus_id,
          COALESCE(template_id, '00000000-0000-0000-0000-000000000000'::uuid),
          week_number, topic_id, subtopic_id,
          created_at ASC, id ASC
      );

      -- Unquoted in the original CREATE TABLE, so Postgres folded the name to
      -- lowercase; matched here unquoted for the same fold.
      ALTER TABLE "${schema}".syllabus_distribution
        DROP CONSTRAINT IF EXISTS uq_syllabus_template_week_topic_subtopic;

      CREATE UNIQUE INDEX IF NOT EXISTS "uq_syllabus_distribution_template_week_topic_subtopic"
        ON "${schema}".syllabus_distribution (
          syllabus_id,
          COALESCE(template_id, '00000000-0000-0000-0000-000000000000'::uuid),
          week_number, topic_id, subtopic_id
        );
    `,
  },
  {
    // JWT revocation, per-user (this codebase has no per-session tracking —
    // permission caching is already per-user, and revocation follows the same
    // granularity). NULL means "never revoked": every token this user holds
    // is honored until it naturally expires.
    //
    // AuthService.revokeUserTokens stamps this to NOW() whenever the user's
    // authority or account state changes (password change, deactivation,
    // credential reset, role assignment/update/delete) or the user logs out.
    // JwtAuthGuard then rejects any token whose `iat` (issued-at) claim
    // predates this timestamp — even one that has not expired yet — so a
    // stolen token, or one belonging to an account that just lost its
    // authority, becomes unusable within the existing auth-state cache's
    // freshness window instead of surviving for the rest of its lifetime.
    // Durable (Postgres-backed) on purpose: the cache alone is ephemeral and
    // must not be the only place revocation is recorded.
    //
    // Nullable, no default: unlike force_password_reset (0005), "never
    // revoked" is the absence of a moment, not a boolean flag, so NULL is the
    // only correct value for both pre-existing and freshly created rows.
    id: '0012_users_tokens_valid_after',
    up: (schema: string) => `
      ALTER TABLE "${schema}".users
        ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ;
    `,
  },
];
