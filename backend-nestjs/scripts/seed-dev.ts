/**
 * Resets the development database and rebuilds it through the real migration
 * path.
 *
 * This script used to be a third implementation of the schema and the seed: 9
 * duplicated CREATE TABLE statements, its own copy of the super-admin
 * permission list, and hardcoded credentials. It drifted, as duplicated
 * definitions do — by the time it was found it produced a tenant with a
 * fraction of the tables, a permission set missing VIEW_ACADEMIC_TIME and
 * VIEW_CATALOGS, a password published in the repository, and no forced password
 * reset. Anyone running `npm run seed:dev` silently undid fixes already made in
 * the migrations.
 *
 * The reset is the only part worth keeping, because `migration:run` alone
 * cannot rebuild a database that already has one. Everything after it now
 * delegates to `database/migrations` and, through the seed migration, to the
 * tenant migration runner — the single source of truth for both schemas.
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Imported after dotenv: the datasource reads process.env when the module is
// evaluated, and it is the same configuration the migration CLI uses, so this
// script cannot drift from it.
import dataSource from '../src/config/datasource.config';

async function resetSchemas(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  await client.connect();
  try {
    const { rows } = await client.query<{ schema_name: string }>(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' OR schema_name = 'public'
    `);

    for (const { schema_name } of rows) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`);
    }

    await client.query(`
      CREATE SCHEMA IF NOT EXISTS public;
      GRANT ALL ON SCHEMA public TO public;
    `);

    console.log(`🗑️  Dropped ${rows.length} schema(s) and recreated public.`);
  } finally {
    await client.end();
  }
}

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed:dev drops every schema in the database. Refusing to run with ' +
        'NODE_ENV=production.',
    );
  }

  console.log(`🔌 Resetting ${process.env.DB_NAME} on ${process.env.DB_HOST}…`);
  await resetSchemas();

  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    console.log(`✅ Applied ${applied.length} migration(s):`);
    applied.forEach((m) => console.log(`   - ${m.name}`));
    console.log(
      '\n🎉 Database rebuilt. The seeded super admin must change its password ' +
        'on first login (AC-016); see the SEED_SUPERADMIN_PASSWORD notice above.',
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error('❌ seed:dev failed:', error);
  process.exit(1);
});
