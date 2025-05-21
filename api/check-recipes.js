// Standalone API for checking recipes
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle GET request
  if (req.method === 'GET') {
    try {
      const { mm_gt_id, ym_gt_id } = req.query;
      
      if (!mm_gt_id || !ym_gt_id) {
        return res.status(400).json({ error: 'mm_gt_id and ym_gt_id are required' });
      }
      
      // 1. Check MMGT recipes
      const mmGtRecipes = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [mm_gt_id]);
      
      // 2. Check YMGT recipes
      const ymGtRecipes = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ym_gt_id]);
      
      // Find MMGT product (for stok_kodu)
      const mmGtProduct = await pool.query('SELECT stok_kodu FROM gal_cost_cal_mm_gt WHERE id = $1', [mm_gt_id]);
      
      // Find YMGT product (for stok_kodu)
      const ymGtProduct = await pool.query('SELECT stok_kodu FROM gal_cost_cal_ym_gt WHERE id = $1', [ym_gt_id]);
      
      // Check the relationship
      const relation = await pool.query(`
        SELECT ym_st_id FROM gal_cost_cal_mm_gt_ym_st 
        WHERE mm_gt_id = $1 
        ORDER BY sira ASC LIMIT 1
      `, [mm_gt_id]);
      
      const mainYmStId = relation.rows.length > 0 ? relation.rows[0].ym_st_id : null;
      
      // Check YMST recipes
      let ymStRecipes = 0;
      if (mainYmStId) {
        const ymStResult = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_ym_st_recete WHERE ym_st_id = $1', [mainYmStId]);
        ymStRecipes = parseInt(ymStResult.rows[0].count);
      }
      
      return res.json({
        status: 'success',
        mm_gt_id: mm_gt_id,
        ym_gt_id: ym_gt_id,
        mm_gt_stok_kodu: mmGtProduct.rows.length > 0 ? mmGtProduct.rows[0].stok_kodu : null,
        ym_gt_stok_kodu: ymGtProduct.rows.length > 0 ? ymGtProduct.rows[0].stok_kodu : null,
        mm_gt_recipes: parseInt(mmGtRecipes.rows[0].count) || 0,
        ym_gt_recipes: parseInt(ymGtRecipes.rows[0].count) || 0,
        main_ym_st_id: mainYmStId,
        ym_st_recipes: ymStRecipes,
        has_all_recipes: (
          parseInt(mmGtRecipes.rows[0].count) > 0 && 
          parseInt(ymGtRecipes.rows[0].count) > 0 && 
          (mainYmStId ? ymStRecipes > 0 : true)
        )
      });
    } catch (error) {
      console.error('Error checking recipes:', error);
      return res.status(500).json({ 
        error: 'Error checking recipes',
        details: error.message
      });
    }
  }
  
  // If neither OPTIONS nor GET
  return res.status(405).json({ error: 'Method not allowed' });
};