// Standalone API for user registration
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle user registration
  if (req.method === 'POST') {
    const { username, password, email, role = 'engineer_1' } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Eksik alanlar' });
    }

    try {
      // Check if user already exists
      const existingUser = await pool.query('SELECT * FROM crm_users WHERE username = $1 OR email = $2', [username, email]);
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Kullanıcı adı veya email zaten kullanılıyor' });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user with UUID
      const result = await pool.query(
        'INSERT INTO crm_users (id, username, password, email, role, created_at) VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW()) RETURNING id, username, email, role',
        [username, hashedPassword, email, role]
      );

      return res.status(201).json({ message: 'Kullanıcı başarıyla oluşturuldu', user: result.rows[0] });
    } catch (error) {
      console.error("Kullanıcı kaydı hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // If neither OPTIONS nor POST
  return res.status(405).json({ error: 'Method not allowed' });
};