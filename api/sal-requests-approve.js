// Standalone API for approving SAL requests
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle PUT request
  if (req.method === 'PUT') {
    try {
      // Extract request ID from URL
      const urlParts = req.url.split('?')[0].split('/');
      const id = urlParts[urlParts.length - 1];
      
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
  
  // If neither OPTIONS nor PUT
  return res.status(405).json({ error: 'Method not allowed' });
};