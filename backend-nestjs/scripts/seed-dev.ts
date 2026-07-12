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

    // 0. RESET: Drop all schemas (public + tenants)
    console.log('🗑️ Dropping existing schemas to start from scratch...');
    
    const schemasRes = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public';
    `);
    
    for (const row of schemasRes.rows) {
      await client.query(`DROP SCHEMA IF EXISTS "${row.schema_name}" CASCADE;`);
    }
    
    await client.query(`
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);

    console.log('✅ Database completely reset.');

    // 1. Create public tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subdomain VARCHAR(255) UNIQUE NOT NULL,
        commercial_name VARCHAR(255) NOT NULL,
        logo_url VARCHAR(255),
        primary_color VARCHAR(50) DEFAULT '#6366f1',
        is_active BOOLEAN DEFAULT true,
        subscription_plan_id UUID,
        status VARCHAR(50) DEFAULT 'active',
        grace_period_until TIMESTAMP WITH TIME ZONE,
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

    // 2. Insert new company 'colegio'
    const insertCompanyRes = await client.query(
      `INSERT INTO public.companies (subdomain, commercial_name, primary_color, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      ['colegio', 'Colegio Odiseo', '#6366f1']
    );
    const companyId = insertCompanyRes.rows[0].id;
    console.log(`✅ Created company 'colegio' with ID: ${companyId}`);

    const schemaName = `tenant_${companyId}`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    console.log(`✅ Created schema: ${schemaName}`);

    // 3. Create tenant tables (including NEW RBAC SCHEMA)
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

      -- NEW RBAC TABLES
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
    `);
    console.log(`✅ Tenant tables provisioned successfully.`);

    // 4. Seed new 'Administrator' default role (US1 Requirement)
    const allPermissionsJSON = JSON.stringify([
      "MANAGE_ROLES", "MANAGE_USERS", "VIEW_SYLLABUS", "EDIT_SYLLABUS", "VIEW_MATERIALS", "EDIT_MATERIALS"
    ]);
    
    const insertRoleRes = await client.query(`
      INSERT INTO "${schemaName}".roles (name, description, is_system_default, permissions) 
      VALUES ('Administrator', 'System default administrator role with full access', true, $1::jsonb)
      RETURNING id;
    `, [allPermissionsJSON]);
    const adminRoleId = insertRoleRes.rows[0].id;
    console.log(`✅ Default 'Administrator' role seeded.`);

    // 5. Seed admin user & assign role
    const email = 'admin@colegio.com';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const insertUserRes = await client.query(
      `INSERT INTO "${schemaName}".users (email, password_hash, name, company_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [email, passwordHash, 'Administrador Colegio', companyId]
    );
    const userId = insertUserRes.rows[0].id;
    console.log(`✅ Created user '${email}'`);

    // Assign role
    await client.query(
      `INSERT INTO "${schemaName}".user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, adminRoleId]
    );
    console.log(`✅ Assigned 'Administrator' role to user '${email}'.`);


    // ==========================================
    // 6. SEED SUPER ADMIN (SYSTEM TENANT)
    // ==========================================
    const sysInsert = await client.query(
      `INSERT INTO public.companies (subdomain, commercial_name, primary_color, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
      ['odiseo', 'Odiseo SaaS', '#000000']
    );
    const sysCompanyId = sysInsert.rows[0].id;
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
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        is_system_default BOOLEAN DEFAULT false,
        permissions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".role_inheritance (
        parent_role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE RESTRICT,
        child_role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE CASCADE,
        PRIMARY KEY (parent_role_id, child_role_id)
      );
      CREATE TABLE IF NOT EXISTS "${sysSchema}".user_roles (
        user_id UUID REFERENCES "${sysSchema}".users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE RESTRICT,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        PRIMARY KEY (user_id, role_id)
      );
    `);

    // Insert super admin role
    const superAdminPermsJSON = JSON.stringify([
      "MANAGE_ROLES", "MANAGE_USERS", "VIEW_SYLLABUS", "EDIT_SYLLABUS", "VIEW_MATERIALS", "EDIT_MATERIALS", "MANAGE_TENANTS"
    ]);
    const sysRoleRes = await client.query(`
      INSERT INTO "${sysSchema}".roles (name, description, is_system_default, permissions) 
      VALUES ('Super Admin', 'System Owner', true, $1::jsonb) RETURNING id;
    `, [superAdminPermsJSON]);
    const sysRoleId = sysRoleRes.rows[0].id;

    // Insert user
    const sysEmail = 'superadmin@odiseo.com';
    const sysPass = 'superadmin123';
    const sysPassHash = await bcrypt.hash(sysPass, 10);
    const sysUserInsert = await client.query(
      `INSERT INTO "${sysSchema}".users (email, password_hash, name, company_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [sysEmail, sysPassHash, 'Super Administrador', sysCompanyId]
    );
    const sysUserId = sysUserInsert.rows[0].id;
    
    // Assign role
    await client.query(`INSERT INTO "${sysSchema}".user_roles (user_id, role_id) VALUES ($1, $2)`, [sysUserId, sysRoleId]);

    console.log('\n🎉 DATABASE FULL RESET & NEW RBAC SEEDED SUCCESSFULLY!');
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
