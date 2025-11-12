// Check Tavli table schemas
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    const tables = [
      'tavli_balya_tel_mm_recete',
      'tavli_netsis_ym_tt_recete',
      'tavli_netsis_ym_stp_recete'
    ];

    for (const table of tables) {
      console.log(`\n📋 Table: ${table}`);
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
        LIMIT 10;
      `, [table]);

      result.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
