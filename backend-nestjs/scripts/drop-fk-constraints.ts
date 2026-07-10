import { Client } from 'pg';

async function dropConstraints() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'odiseo',
  });

  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL to drop invalid public.material_requests foreign keys...');

    // Query to find constraints on public.material_requests referencing cycles or pdf_design_templates
    const fkQuery = `
      SELECT tc.constraint_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
        AND tc.table_name = 'material_requests'
        AND ccu.table_name IN ('cycles', 'pdf_design_templates');
    `;

    const res = await client.query(fkQuery);
    
    if (res.rows.length === 0) {
      console.log('ℹ️ No invalid cross-schema foreign key constraints found.');
    } else {
      for (const row of res.rows) {
        const constraintName = row.constraint_name;
        console.log(`🗑️ Dropping invalid constraint: ${constraintName}`);
        await client.query(`ALTER TABLE public.material_requests DROP CONSTRAINT "${constraintName}"`);
      }
      console.log('✅ Done. Invalid foreign key constraints dropped.');
    }
  } catch (err) {
    console.error('❌ Failed to drop constraints:', err);
  } finally {
    await client.end();
  }
}

dropConstraints();
