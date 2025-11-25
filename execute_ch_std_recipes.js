// CH.STD reçete SQL scriptini çalıştırmak için script
require('dotenv').config({ path: '/mnt/c/Users/Selman/Desktop/UBUNTU/crm_deneme_backend-main/.env' });
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function executeChStdRecipes() {
  let client;
  try {
    console.log('🚀 Connecting to database...');
    client = await pool.connect();
    
    console.log('📖 Reading SQL script...');
    const sqlScript = fs.readFileSync('/mnt/c/Users/Selman/Desktop/UBUNTU/add_ch_std_recipe_rows_correct_structure.sql', 'utf8');
    
    console.log('✅ Executing CH.STD recipe insertion...');
    const result = await client.query(sqlScript);
    
    console.log(`✅ SUCCESS: Inserted CH.STD recipes. Affected rows: ${result.rowCount || 'Multiple'}`);
    console.log('🎉 CH.STD recipes have been successfully added to the database!');
    
  } catch (error) {
    console.error('❌ ERROR executing CH.STD recipes:', error);
    console.error('Error details:', error.message);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

executeChStdRecipes();