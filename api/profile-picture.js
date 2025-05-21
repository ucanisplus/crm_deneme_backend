// Standalone API for profile picture operations
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle GET request (retrieve profile picture)
  if (req.method === 'GET') {
    try {
      const { username } = req.query;
      
      if (!username) {
        return res.status(400).json({ error: 'Kullanıcı adı gerekli' });
      }
      
      // Table name profile_pictures (with underscore)
      const result = await pool.query(`
        SELECT * FROM profile_pictures 
        WHERE username = $1
      `, [username]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Profil resmi bulunamadı' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error("Profil resmi getirme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Handle POST request (create/update profile picture)
  if (req.method === 'POST') {
    try {
      const { username, pp_url } = req.body;
      
      if (!username || !pp_url) {
        return res.status(400).json({ error: 'Kullanıcı adı ve profil resmi URL\'si gerekli' });
      }
      
      // Check if profile picture already exists for the user
      const existingPP = await pool.query(`
        SELECT * FROM profile_pictures 
        WHERE username = $1
      `, [username]);
      
      let result;
      
      if (existingPP.rows.length > 0) {
        // Update existing profile picture
        result = await pool.query(`
          UPDATE profile_pictures 
          SET pp_url = $1 
          WHERE username = $2 
          RETURNING *
        `, [pp_url, username]);
      } else {
        // Create new profile picture entry
        result = await pool.query(`
          INSERT INTO profile_pictures (id, username, pp_url) 
          VALUES (uuid_generate_v4(), $1, $2) 
          RETURNING *
        `, [username, pp_url]);
      }
      
      return res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("Profil resmi güncelleme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // If neither OPTIONS, GET, nor POST
  return res.status(405).json({ error: 'Method not allowed' });
};