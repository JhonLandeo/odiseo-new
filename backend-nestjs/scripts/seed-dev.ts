import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

async function seed() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '123456',
    database: 'odiseo',
  });

  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL database...');

    // Ensure public.companies exists
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

    console.log('\n🎉 DEVELOPMENT SEED COMPLETED SUCCESSFULLY!');
    console.log('----------------------------------------------------');
    console.log('Use the following details to log in to the system:');
    console.log('----------------------------------------------------');
    console.log(`URL:        http://colegio.localhost:3001/login`);
    console.log(`Email:      ${email}`);
    console.log(`Password:   ${password}`);
    console.log(`Subdomain:  colegio`);
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await client.end();
  }
}

seed();
