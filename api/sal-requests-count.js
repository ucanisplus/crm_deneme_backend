// Standalone API for SAL requests count
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
  
  // If neither OPTIONS nor GET
  return res.status(405).json({ error: 'Method not allowed' });
};