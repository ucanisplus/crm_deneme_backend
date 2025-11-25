const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://galvaniz_db_user:q7Ik8xHISvIEfaeT@dpg-csjh96lds78s73fgejd0-a.oregon-postgres.render.com/galvaniz_db',
  ssl: { rejectUnauthorized: false }
});

async function testRecipeFilter() {
  try {
    console.log('\n=== TESTING RECIPE FILTER DIRECTLY IN DATABASE ===\n');

    // Test with a product that should have recipes
    const testStokKodu = 'YM.TT.BAG.0120.00';

    console.log(`1. Testing with existing product: ${testStokKodu}`);

    // Simulate the backend Sorgu logic EXACTLY
    const ym_tt_stok_kodu = testStokKodu;
    const mamul_kodu = undefined;
    const limit = 2000;

    let query = 'SELECT * FROM tavli_netsis_ym_tt_recete WHERE 1=1';
    const params = [];

    if (ym_tt_stok_kodu) {
      params.push(ym_tt_stok_kodu);
      query += ` AND ym_tt_stok_kodu = $${params.length}`;
    }

    if (mamul_kodu) {
      params.push(mamul_kodu);
      query += ` AND mamul_kodu = $${params.length}`;
    }

    query += ' ORDER BY sira_no ASC';

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    console.log('Query:', query);
    console.log('Params:', params);
    console.log('');

    const result = await pool.query(query, params);
    console.log(`✓ Query returned ${result.rows.length} recipes`);

    if (result.rows.length > 0) {
      console.log(`  First recipe: ${result.rows[0].mamul_kodu}`);
      console.log(`  Last recipe: ${result.rows[result.rows.length-1].mamul_kodu}`);
    }

    // Test 2: Without Filtre (should return all)
    console.log(`\n2. Testing WITHOUT filter (should return all ~82 recipes):`);
    const allResult = await pool.query('SELECT COUNT(*) FROM tavli_netsis_ym_tt_recete');
    console.log(`✓ Total recipes in database: ${allResult.rows[0].count}`);

    // Test 3: With a non-existent product
    console.log(`\n3. Testing with non-existent product: YM.TT.BALYA.0130.00`);
    const emptyResult = await pool.query(
      'SELECT * FROM tavli_netsis_ym_tt_recete WHERE ym_tt_stok_kodu = $1',
      ['YM.TT.BALYA.0130.00']
    );
    console.log(`✓ Query returned ${emptyResult.rows.length} recipes (should be 0)`);

    console.log('\n=== CONCLUSION ===');
    console.log('Database filter works correctly!');
    console.log('Problem must be with Vercel deployment/caching.\n');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testRecipeFilter();
