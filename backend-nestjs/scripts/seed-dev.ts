import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar archivo .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function seed() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'odiseo',
  });

  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL database...');

    // Ensure public tables exist to support tenant table FK constraints
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subdomain VARCHAR(255) UNIQUE NOT NULL,
        commercial_name VARCHAR(255) NOT NULL,
        logo_url VARCHAR(255),
        primary_color VARCHAR(50) DEFAULT '#6366f1',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.subtopics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);

    // 1. Check if the 'colegio' company already exists
    const checkCompanyRes = await client.query(
      `SELECT * FROM public.companies WHERE subdomain = $1`,
      ['colegio']
    );

    let companyId: string;
    if (checkCompanyRes.rows.length > 0) {
      companyId = checkCompanyRes.rows[0].id;
      console.log(`ℹ️ Company 'colegio' already exists with ID: ${companyId}`);
    } else {
      // Insert new company
      const insertCompanyRes = await client.query(
        `INSERT INTO public.companies (subdomain, commercial_name, primary_color, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        ['colegio', 'Colegio Odiseo', '#6366f1']
      );
      companyId = insertCompanyRes.rows[0].id;
      console.log(`✅ Created company 'colegio' with ID: ${companyId}`);
    }

    const schemaName = `tenant_${companyId}`;

    // 2. Create tenant schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    console.log(`✅ Created schema: ${schemaName}`);

    // 3. Create tenant tables
    await client.query(`
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
        name VARCHAR(100) NOT NULL UNIQUE,
        guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".model_has_roles (
        role_id UUID NOT NULL REFERENCES "${schemaName}".roles(id) ON DELETE CASCADE,
        model_id UUID NOT NULL,
        model_type VARCHAR(100) NOT NULL DEFAULT 'User',
        PRIMARY KEY (role_id, model_id, model_type)
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".role_has_permissions (
        role_id UUID NOT NULL REFERENCES "${schemaName}".roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES "${schemaName}".permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".tenant_topic_visibility (
        topic_id UUID PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
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
        course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
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
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".syllabus (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_id UUID NOT NULL REFERENCES "${schemaName}".cycles(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        template_id UUID REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "${schemaName}".syllabus_distribution (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        syllabus_id UUID NOT NULL REFERENCES "${schemaName}".syllabus(id) ON DELETE RESTRICT,
        template_id UUID REFERENCES "${schemaName}".cycle_material_templates(id) ON DELETE SET NULL,
        week_number INTEGER NOT NULL,
        topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
        subtopic_id UUID NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
        question_count INTEGER NOT NULL CHECK (question_count > 0),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT UQ_syllabus_template_week_topic_subtopic UNIQUE (syllabus_id, template_id, week_number, topic_id, subtopic_id)
      );
    `);
    console.log(`✅ Tenant tables provisioned successfully.`);

    // 4. Seed admin role & permissions
    await client.query(`
      INSERT INTO "${schemaName}".roles (name, guard_name) 
      VALUES ('admin', 'web')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO "${schemaName}".permissions (name, guard_name) VALUES
        ('view_catalogs', 'web'),
        ('edit_catalogs', 'web'),
        ('view_materials', 'web'),
        ('generate_material', 'web'),
        ('review_material', 'web'),
        ('view_syllabus', 'web'),
        ('edit_syllabus', 'web'),
        ('manage_academic_time', 'web')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO "${schemaName}".role_has_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM "${schemaName}".roles r, "${schemaName}".permissions p
        WHERE r.name = 'admin'
      ON CONFLICT DO NOTHING;
    `);
    console.log(`✅ Admin role and permissions seeded.`);

    // 5. Seed default admin user
    const email = 'admin@colegio.com';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const checkUserRes = await client.query(
      `SELECT * FROM "${schemaName}".users WHERE email = $1`,
      [email]
    );

    let userId: string;
    if (checkUserRes.rows.length > 0) {
      userId = checkUserRes.rows[0].id;
      console.log(`ℹ️ User '${email}' already exists.`);
    } else {
      const insertUserRes = await client.query(
        `INSERT INTO "${schemaName}".users (email, password_hash, name, company_id, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [email, passwordHash, 'Administrador Colegio', companyId]
      );
      userId = insertUserRes.rows[0].id;
      console.log(`✅ Created user '${email}'`);
    }

    // Assign admin role to user
    await client.query(
      `INSERT INTO "${schemaName}".model_has_roles (role_id, model_id, model_type)
       SELECT r.id, $1, 'User' FROM "${schemaName}".roles r WHERE r.name = 'admin'
       ON CONFLICT DO NOTHING`,
      [userId]
    );
    console.log(`✅ Assigned 'admin' role to user '${email}'.`);

    // ==========================================
    // 6. SEED SUPER ADMIN (SYSTEM TENANT)
    // ==========================================
    const sysCheck = await client.query(`SELECT * FROM public.companies WHERE subdomain = $1`, ['odiseo']);
    let sysCompanyId: string;
    if (sysCheck.rows.length > 0) {
      sysCompanyId = sysCheck.rows[0].id;
    } else {
      const sysInsert = await client.query(
        `INSERT INTO public.companies (subdomain, commercial_name, primary_color, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
        ['odiseo', 'Odiseo SaaS', '#000000']
      );
      sysCompanyId = sysInsert.rows[0].id;
    }
    const sysSchema = `tenant_${sysCompanyId}`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${sysSchema}"`);
    
    // Create base tables for system tenant
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${sysSchema}".users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        company_id UUID NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".model_has_roles (
        role_id UUID NOT NULL REFERENCES "${sysSchema}".roles(id) ON DELETE CASCADE,
        model_id UUID NOT NULL,
        model_type VARCHAR(100) NOT NULL DEFAULT 'User',
        PRIMARY KEY (role_id, model_id, model_type)
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".role_has_permissions (
        role_id UUID NOT NULL REFERENCES "${sysSchema}".roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES "${sysSchema}".permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `);

    // Insert role and user
    await client.query(`
      INSERT INTO "${sysSchema}".roles (name, guard_name) VALUES ('super_admin', 'web') ON CONFLICT (name) DO NOTHING;
      
      INSERT INTO "${sysSchema}".permissions (name, guard_name) VALUES
        ('view_catalogs', 'web'),
        ('edit_catalogs', 'web'),
        ('view_materials', 'web'),
        ('generate_material', 'web'),
        ('review_material', 'web'),
        ('view_syllabus', 'web'),
        ('edit_syllabus', 'web'),
        ('manage_academic_time', 'web'),
        ('manage_tenants', 'web')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO "${sysSchema}".role_has_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM "${sysSchema}".roles r, "${sysSchema}".permissions p
        WHERE r.name = 'super_admin'
      ON CONFLICT DO NOTHING;
    `);
    const sysEmail = 'superadmin@odiseo.com';
    const sysPass = 'superadmin123';
    const sysPassHash = await bcrypt.hash(sysPass, 10);
    const sysUserCheck = await client.query(`SELECT * FROM "${sysSchema}".users WHERE email = $1`, [sysEmail]);
    let sysUserId: string;
    if (sysUserCheck.rows.length > 0) {
      sysUserId = sysUserCheck.rows[0].id;
    } else {
      const sysUserInsert = await client.query(
        `INSERT INTO "${sysSchema}".users (email, password_hash, name, company_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [sysEmail, sysPassHash, 'Super Administrador', sysCompanyId]
      );
      sysUserId = sysUserInsert.rows[0].id;
    }
    await client.query(
      `INSERT INTO "${sysSchema}".model_has_roles (role_id, model_id, model_type) SELECT r.id, $1, 'User' FROM "${sysSchema}".roles r WHERE r.name = 'super_admin' ON CONFLICT DO NOTHING`,
      [sysUserId]
    );

    console.log('\n🎉 DEVELOPMENT SEED COMPLETED SUCCESSFULLY!');
    console.log('----------------------------------------------------');
    console.log('Use the following details to log in to the system:');
    console.log('----------------------------------------------------');
    console.log(`[TENANT NORMAL]`);
    console.log(`URL:        http://colegio.localhost:3001/login`);
    console.log(`Email:      ${email}`);
    console.log(`Password:   ${password}`);
    console.log(`Subdomain:  colegio`);
    console.log('----------------------------------------------------');
    console.log(`[SUPER ADMIN]`);
    console.log(`URL:        http://odiseo.localhost:3001/login`);
    console.log(`Email:      superadmin@odiseo.com`);
    console.log(`Password:   superadmin123`);
    console.log(`Subdomain:  odiseo`);
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await client.end();
  }
}

seed();
