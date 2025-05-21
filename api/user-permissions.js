// Standalone API for user permissions
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
  
  // Handle GET request to get user permissions
  if (req.method === 'GET') {
    try {
      // Get userId from URL path
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const result = await pool.query(`
        SELECT u.id, u.username, u.email, u.role, 
               ARRAY_AGG(DISTINCT p.permission_name) as permissions
        FROM crm_users u
        LEFT JOIN user_permissions p ON u.role = p.role
        WHERE u.id = $1
        GROUP BY u.id, u.username, u.email, u.role
      `, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error("Kullanıcı izinleri getirme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // If neither OPTIONS nor GET
  return res.status(405).json({ error: 'Method not allowed' });
};