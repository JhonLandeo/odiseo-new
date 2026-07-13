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
    console.log('🔌 Connected to database. Querying companies...');

    const companiesRes = await client.query(`
      SELECT id, subdomain, commercial_name, is_active 
      FROM public.companies
    `);

    if (companiesRes.rows.length === 0) {
      console.log('No companies found in public.companies.');
      return;
    }

    console.log('\n--- COMPANIES & USERS ---');
    for (const company of companiesRes.rows) {
      console.log(`\n🏢 Company: ${company.commercial_name} (Subdomain: "${company.subdomain}")`);
      console.log(`   ID: ${company.id}`);
      
      const schemaName = `tenant_${company.id}`;
      
      // Check if schema exists
      const schemaCheck = await client.query(`
        SELECT schema_name FROM information_schema.schemata 
        WHERE schema_name = $1
      `, [schemaName]);

      if (schemaCheck.rows.length === 0) {
        console.log(`   ⚠️ Schema "${schemaName}" does not exist in the database.`);
        continue;
      }

      // Query users in this schema
      try {
        const usersRes = await client.query(`
          SELECT id, email, name, is_active FROM "${schemaName}".users
        `);
        if (usersRes.rows.length === 0) {
          console.log(`   No users found in schema "${schemaName}".`);
        } else {
          console.log(`   👤 Users:`);
          usersRes.rows.forEach(user => {
            console.log(`     - [${user.is_active ? 'Active' : 'Inactive'}] Email: ${user.email} | Name: ${user.name}`);
          });
        }
      } catch (err) {
        console.log(`   ❌ Error querying users in schema "${schemaName}": ${err.message}`);
      }
    }
    console.log('\n-------------------------');

  } catch (error) {
    console.error('❌ Failed to run script:', error);
  } finally {
    await client.end();
  }
}

main();
