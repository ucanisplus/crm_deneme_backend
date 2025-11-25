const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.nqedxzjtypxuzxnhakoe:q7Ik8xHISvIEfaeT@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔧 Running migration: Drop yaglama constraint...\n');

    // Read the SQL file
    const sqlFile = path.join(__dirname, 'migrations', '20251112_drop_yaglama_constraint.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the Migrasyon
    await client.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('✅ Constraint chk_request_product_type_yaglama has been dropped\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
