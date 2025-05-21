// Combined API for authentication and user management
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
  
  // Login endpoint
  if (path === '/login' && req.method === 'POST') {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      // Find user by username
      const result = await pool.query('SELECT * FROM crm_users WHERE username = $1', [username]);
      
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid username or password' });
      }
      
      const user = result.rows[0];
      
      // Compare password with hashed password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Invalid username or password' });
      }
      
      return res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Signup endpoint
  else if (path === '/signup' && req.method === 'POST') {
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
  
  // Get user permissions
  else if (path.startsWith('/user/permissions/') && req.method === 'GET') {
    try {
      // Get userId from URL path
      const userId = path.split('/').pop();
      
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
  
  // Profile picture operations
  else if (path === '/user/profile-picture') {
    // GET - retrieve profile picture
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
    
    // POST - create/update profile picture
    else if (req.method === 'POST') {
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
  }
  
  // Get all users (for admin panel)
  else if (path === '/users' && req.method === 'GET') {
    try {
      const result = await pool.query(`
        SELECT id, username, email, role, created_at 
        FROM crm_users 
        ORDER BY created_at DESC
      `);
      
      return res.json(result.rows);
    } catch (error) {
      console.error("Kullanıcıları getirme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Update user
  else if (path.startsWith('/users/') && req.method === 'PUT') {
    try {
      const userId = path.split('/').pop();
      const { username, email, role } = req.body;
      
      // Don't allow password updates through this endpoint
      const result = await pool.query(`
        UPDATE crm_users 
        SET username = $1, email = $2, role = $3
        WHERE id = $4
        RETURNING id, username, email, role
      `, [username, email, role, userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      
      return res.json(result.rows[0]);
    } catch (error) {
      console.error("Kullanıcı güncelleme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Delete user
  else if (path.startsWith('/users/') && req.method === 'DELETE') {
    try {
      const userId = path.split('/').pop();
      
      const result = await pool.query(`
        DELETE FROM crm_users
        WHERE id = $1
        RETURNING id, username
      `, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      
      return res.json({ message: 'Kullanıcı başarıyla silindi', deletedUser: result.rows[0] });
    } catch (error) {
      console.error("Kullanıcı silme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Add user permission
  else if (path === '/user-permissions' && req.method === 'POST') {
    try {
      const { role, permission_name } = req.body;
      
      if (!role || !permission_name) {
        return res.status(400).json({ error: 'Gerekli alanlar eksik' });
      }
      
      // Check if permission already exists
      const existingPermission = await pool.query(
        'SELECT * FROM user_permissions WHERE role = $1 AND permission_name = $2',
        [role, permission_name]
      );
      
      if (existingPermission.rows.length > 0) {
        return res.status(400).json({ error: 'Bu rol için izin zaten mevcut' });
      }
      
      const result = await pool.query(
        'INSERT INTO user_permissions (id, role, permission_name) VALUES (uuid_generate_v4(), $1, $2) RETURNING *',
        [role, permission_name]
      );
      
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("İzin ekleme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Get all permissions
  else if (path === '/user-permissions' && req.method === 'GET') {
    try {
      const result = await pool.query('SELECT * FROM user_permissions ORDER BY role, permission_name');
      return res.json(result.rows);
    } catch (error) {
      console.error("İzinleri getirme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Delete permission
  else if (path.startsWith('/user-permissions/') && req.method === 'DELETE') {
    try {
      const id = path.split('/').pop();
      
      const result = await pool.query(
        'DELETE FROM user_permissions WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'İzin bulunamadı' });
      }
      
      return res.json({ message: 'İzin başarıyla silindi', deletedPermission: result.rows[0] });
    } catch (error) {
      console.error("İzin silme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Change password
  else if (path === '/change-password' && req.method === 'POST') {
    try {
      const { userId, currentPassword, newPassword } = req.body;
      
      if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Gerekli alanlar eksik' });
      }
      
      // Get the user
      const userResult = await pool.query('SELECT * FROM crm_users WHERE id = $1', [userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      
      const user = userResult.rows[0];
      
      // Verify current password
      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: 'Mevcut şifre yanlış' });
      }
      
      // Hash and update the new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      await pool.query(
        'UPDATE crm_users SET password = $1 WHERE id = $2',
        [hashedNewPassword, userId]
      );
      
      return res.json({ message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
      console.error("Şifre değiştirme hatası:", error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Test database connection
  else if (path === '/test' && req.method === 'GET') {
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
  
  else {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
};