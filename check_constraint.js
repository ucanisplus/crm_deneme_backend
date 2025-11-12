const { Pool } = require('pg');

const pool = new Pool({
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.nqedxzjtypxuzxnhakoe',
  password: 'q7Ik8xHISvIEfaeT',
  ssl: { rejectUnauthorized: false }
});

async function checkConstraint() {
  try {
    // Get constraint definition
    const result = await pool.query(`
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conname = 'chk_request_product_type_yaglama'
    `);

    console.log('=== CONSTRAINT DEFINITION ===');
    console.log(JSON.stringify(result.rows, null, 2));

    // Get table columns
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tavli_balya_tel_sal_requests'
      ORDER BY ordinal_position
    `);

    console.log('\n=== TABLE COLUMNS ===');
    console.log(JSON.stringify(cols.rows, null, 2));

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkConstraint();
