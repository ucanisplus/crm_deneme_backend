// Script to apply Tavli/Balya Tel Veritabanı indexes Migrasyon
// Run with: node run_tavli_migration.js

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('🔧 Starting Tavli/Balya Tel indexes migration...\n');

  try {
    // Read the Migrasyon SQL file
    const migrationPath = path.join(__dirname, 'migrations', '20251112_add_tavli_tel_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded successfully');
    console.log('🔗 Connected to database\n');

    // Execute the Migrasyon
    console.log('⚙️  Creating indexes...');
    await pool.query(sql);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verifying indexes...');

    // Verify indexes were created
    const result = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN (
        'tavli_balya_tel_mm_recete',
        'tavli_netsis_ym_tt_recete',
        'tavli_netsis_ym_stp_recete',
        'tavli_balya_tel_mm'
      )
      AND indexname LIKE 'idx_tavli%'
      ORDER BY tablename, indexname;
    `);

    console.log(`\n✅ Created ${result.rows.length} indexes:\n`);
    result.rows.forEach(row => {
      console.log(`   📌 ${row.tablename}: ${row.indexname}`);
    });

    console.log('\n🎉 Migration successful! Tavli/Balya Tel queries should be much faster now.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
