// Standalone API for testing database connection
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
  
  // Handle GET request for testing
  if (req.method === 'GET') {
    try {
      const result = await pool.query("SELECT NOW()");
      return res.json({ message: "Veritabanı Bağlandı!", timestamp: result.rows[0].now });
    } catch (error) {
      console.error("Veritabanı Bağlantı Hatası:", error);
      return res.status(500).json({ 
        error: "Veritabanı bağlantısı başarısız", 
        details: error.message 
      });
    }
  }
  
  // If neither OPTIONS nor GET
  return res.status(405).json({ error: 'Method not allowed' });
};