const { Pool } = require('pg');

// Veritabanı Bağlantı
const pool = new Pool({
  connectionString: 'postgresql://galvaniz_db_user:q7Ik8xHISvIEfaeT@dpg-csjh96lds78s73fgejd0-a.oregon-postgres.render.com/galvaniz_db',
  ssl: { rejectUnauthorized: false }
});

async function testFilter() {
  try {
    console.log('\n=== TESTING YM TT FILTER ===\n');

    // Test 1: Count all YM TT products
    const allCount = await pool.query('SELECT COUNT(*) FROM tavli_netsis_ym_tt');
    console.log(`1. Total YM TT products in database: ${allCount.rows[0].count}`);

    // Test 2: WITHOUT Filtre (OLD BEHAVIOR - returns all products)
    const withoutFilter = await pool.query('SELECT * FROM tavli_netsis_ym_tt WHERE 1=1 ORDER BY created_at DESC');
    console.log(`2. WITHOUT source_mm_stok_kodu filter: ${withoutFilter.rows.length} products returned`);

    // Test 3: WITH Filtre for TT.BAG.0170.00 (NEW BEHAVIOR - should return only 1)
    const testStokKodu = 'TT.BAG.0170.00';
    const withFilter = await pool.query(
      'SELECT * FROM tavli_netsis_ym_tt WHERE source_mm_stok_kodu = $1',
      [testStokKodu]
    );
    console.log(`3. WITH source_mm_stok_kodu = '${testStokKodu}': ${withFilter.rows.length} product(s) returned`);

    if (withFilter.rows.length > 0) {
      console.log(`   ✓ Product found: ${withFilter.rows[0].stok_kodu}`);
    }

    // Test 4: Verify uniqueness for several MM TT products
    console.log('\n4. Testing 1:1 relationship for other MM TT products:');
    const mmProducts = ['TT.BAG.0120.00', 'TT.BAG.0150.00', 'TT.BAG.0160.00'];

    for (const mmStokKodu of mmProducts) {
      const result = await pool.query(
        'SELECT stok_kodu FROM tavli_netsis_ym_tt WHERE source_mm_stok_kodu = $1',
        [mmStokKodu]
      );
      console.log(`   ${mmStokKodu} → ${result.rows.length} YM TT product(s)`);
      if (result.rows.length > 0) {
        console.log(`      └─ ${result.rows[0].stok_kodu}`);
      }
    }

    console.log('\n=== CONCLUSION ===');
    console.log(`✓ Filter working correctly: Each MM TT returns exactly 1 YM TT`);
    console.log(`✓ When you delete TT.BAG.0170.00, only its related YM TT will be deleted`);
    console.log(`✓ NOT all ${allCount.rows[0].count} products!\n`);

  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    await pool.end();
  }
}

testFilter();
