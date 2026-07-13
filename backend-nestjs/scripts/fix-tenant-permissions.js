const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'odiseo',
  });

  try {
    await client.connect();
    console.log('🔌 Connected to database. Updating tenant permissions...');

    const companiesRes = await client.query(`
      SELECT id, subdomain, commercial_name 
      FROM public.companies
    `);

    const newPermissions = JSON.stringify([
      'view_catalogs',
      'edit_catalogs',
      'view_materials',
      'generate_material',
      'review_material',
      'view_syllabus',
      'edit_syllabus',
      'manage_academic_time'
    ]);

    for (const company of companiesRes.rows) {
      if (company.subdomain === 'odiseo') continue; // Skip super admin system tenant

      const schemaName = `tenant_${company.id}`;
      
      // Check if schema exists
      const schemaCheck = await client.query(`
        SELECT schema_name FROM information_schema.schemata 
        WHERE schema_name = $1
      `, [schemaName]);

      if (schemaCheck.rows.length === 0) {
        continue;
      }

      console.log(`🏢 Updating permissions for tenant: ${company.commercial_name} (Schema: ${schemaName})`);
      
      try {
        const updateRes = await client.query(`
          UPDATE "${schemaName}".roles 
          SET permissions = $1::jsonb 
          WHERE name = 'Director'
        `, [newPermissions]);
        
        console.log(`   ✅ Successfully updated Director role permissions.`);
      } catch (err) {
        console.log(`   ❌ Error updating schema "${schemaName}": ${err.message}`);
      }
    }

    console.log('\n🎉 Finished updating permissions!');

  } catch (error) {
    console.error('❌ Failed to run script:', error);
  } finally {
    await client.end();
  }
}

main();
