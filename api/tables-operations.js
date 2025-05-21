// Combined API for special table operations
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get the path from the URL
  const path = req.url.split('?')[0];
  console.log('Request path:', path);
  console.log('Request method:', req.method);
  
  // Get next sequence number
  if (path === '/gal_cost_cal_sequence/next' && req.method === 'GET') {
    try {
      const { kod_2, cap } = req.query;
      
      if (!kod_2 || !cap) {
        return res.status(400).json({ error: 'kod_2 and cap parameters are required' });
      }
      
      // Convert comma decimal to dot format
      let normalizedCap = cap;
      if (typeof cap === 'string' && cap.includes(',')) {
        normalizedCap = cap.replace(/,/g, '.');
      }
      
      // Format cap correctly
      const formattedCap = parseFloat(normalizedCap).toFixed(2).replace('.', '').padStart(4, '0');
      
      // Find highest sequence number for this combination
      const result = await pool.query(`
        SELECT MAX(CAST(SUBSTRING(stok_kodu FROM 10 FOR 2) AS INTEGER)) as max_seq
        FROM gal_cost_cal_mm_gt
        WHERE kod_2 = $1 AND stok_kodu LIKE $2
      `, [kod_2, `GT.${kod_2}.${formattedCap}.%`]);
      
      let nextSeq = 1;
      if (result.rows.length > 0 && result.rows[0].max_seq !== null) {
        nextSeq = result.rows[0].max_seq + 1;
      }
      
      // Format as 2-digit sequence number
      const formattedSeq = nextSeq.toString().padStart(2, '0');
      
      return res.json({ 
        next_sequence: nextSeq,
        formatted_sequence: formattedSeq,
        stok_kodu: `GT.${kod_2}.${formattedCap}.${formattedSeq}`
      });
    } catch (error) {
      console.error('Error getting sequence number:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Check if recipes exist
  else if (path === '/check-recipes' && req.method === 'GET') {
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
  
  // Get requests count
  else if (path === '/gal_cost_cal_sal_requests/count' && req.method === 'GET') {
    try {
      const { status, created_by } = req.query;
      let query = 'SELECT COUNT(*) FROM gal_cost_cal_sal_requests';
      const queryParams = [];
      const whereConditions = [];
      
      if (status) {
        whereConditions.push(`status = $${queryParams.length + 1}`);
        queryParams.push(status);
      }
      
      if (created_by) {
        whereConditions.push(`created_by = $${queryParams.length + 1}`);
        queryParams.push(created_by);
      }
      
      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }
      
      const result = await pool.query(query, queryParams);
      return res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
      console.error('Error getting request count:', error);
      return res.status(500).json({ error: 'Failed to get request count' });
    }
  }
  
  // Approve request
  else if (path.includes('/gal_cost_cal_sal_requests/') && path.endsWith('/approve') && req.method === 'PUT') {
    try {
      // Extract request ID from URL
      const pathParts = path.split('/');
      const id = pathParts[pathParts.length - 2];
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID is required' });
      }
      
      const { processed_by } = req.body;
      
      if (!processed_by) {
        return res.status(400).json({ error: 'processed_by field is required' });
      }
      
      const query = `
        UPDATE gal_cost_cal_sal_requests
        SET status = 'approved', processed_by = $1, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, [processed_by, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Error approving request:', error);
      return res.status(500).json({ error: 'Could not approve request: ' + error.message });
    }
  }
  
  // Reject request
  else if (path.includes('/gal_cost_cal_sal_requests/') && path.endsWith('/reject') && req.method === 'PUT') {
    try {
      // Extract request ID from URL
      const pathParts = path.split('/');
      const id = pathParts[pathParts.length - 2];
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID is required' });
      }
      
      const { processed_by, rejection_reason } = req.body;
      
      if (!processed_by || !rejection_reason) {
        return res.status(400).json({ error: 'processed_by and rejection_reason fields are required' });
      }
      
      const query = `
        UPDATE gal_cost_cal_sal_requests
        SET status = 'rejected', processed_by = $1, rejection_reason = $2, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await pool.query(query, [processed_by, rejection_reason, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Error rejecting request:', error);
      return res.status(500).json({ error: 'Could not reject request: ' + error.message });
    }
  }
  
  else {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
};