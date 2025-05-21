// All-in-one API handler for all routes
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Brevo/Sendinblue client
let apiInstance = null;
try {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  console.log('✅ Brevo API client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Brevo API client:', error);
}

// Helper function for number formatting
const normalizeNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    if (value.includes(',')) return parseFloat(value.replace(/,/g, '.'));
    if (!isNaN(parseFloat(value))) return parseFloat(value);
  }
  return value;
};

// Helper function to process data - converting comma decimals to period format
const normalizeData = (data) => {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) return data.map(item => normalizeData(item));
  if (typeof data === 'object') {
    const normalizedData = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.trim() === '') {
        normalizedData[key] = null;
      } else if (value !== null && typeof value === 'object') {
        normalizedData[key] = normalizeData(value);
      } else {
        normalizedData[key] = normalizeNumber(value);
      }
    }
    return normalizedData;
  }
  return normalizeNumber(data);
};

// Data validation function
const validateData = (data) => {
  if (!data) {
    return { valid: false, error: 'Veri boş olamaz' };
  }
  if (typeof data !== 'object' || (Array.isArray(data) && data.length === 0)) {
    return { valid: false, error: 'Geçersiz veri formatı' };
  }
  if (!Array.isArray(data) && Object.keys(data).length === 0) {
    return { valid: false, error: 'Boş nesne gönderilemez' };
  }
  return { valid: true };
};

// List of tables to support
const tables = [
  // Panel Çit tables
  'panel_cost_cal_currency',
  'panel_cost_cal_gecici_hesaplar',
  'panel_cost_cal_genel_degiskenler',
  'panel_cost_cal_maliyet_listesi',
  'panel_cost_cal_panel_cit_degiskenler',
  'panel_cost_cal_panel_list',
  'panel_cost_cal_profil_degiskenler',
  'panel_cost_cal_statik_degiskenler',
  
  // Galvanizli Tel tables
  'gal_cost_cal_mm_gt',
  'gal_cost_cal_ym_gt',
  'gal_cost_cal_ym_st',
  'gal_cost_cal_mm_gt_recete',
  'gal_cost_cal_ym_gt_recete',
  'gal_cost_cal_ym_st_recete',
  'gal_cost_cal_mm_gt_ym_st',
  'gal_cost_cal_sequence',
  'gal_cost_cal_sal_requests',
  'gal_cost_cal_user_input_values',
  'gal_cost_cal_user_tlc_hizlar',
  
  // User management tables
  'crm_users',
  'user_permissions',
  'profile_pictures'
];

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
  const urlParams = new URL(req.url, 'http://localhost');
  const path = urlParams.pathname;
  
  console.log('Request path:', path);
  console.log('Request method:', req.method);
  console.log('Query params:', urlParams.searchParams.toString());
  
  try {
    // -------------------- AUTH ROUTES --------------------
    
    // Login endpoint
    if (path === '/api/login' && req.method === 'POST') {
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
    else if (path === '/api/signup' && req.method === 'POST') {
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
    else if (path.startsWith('/api/user/permissions/') && req.method === 'GET') {
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
    else if (path === '/api/user/profile-picture') {
      // GET - retrieve profile picture
      if (req.method === 'GET') {
        try {
          const username = urlParams.searchParams.get('username');
          
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
    else if (path === '/api/users' && req.method === 'GET') {
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
    else if (path.match(/^\/api\/users\/[^\/]+$/) && req.method === 'PUT') {
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
    else if (path.match(/^\/api\/users\/[^\/]+$/) && req.method === 'DELETE') {
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
    else if (path === '/api/user-permissions' && req.method === 'POST') {
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
    else if (path === '/api/user-permissions' && req.method === 'GET') {
      try {
        const result = await pool.query('SELECT * FROM user_permissions ORDER BY role, permission_name');
        return res.json(result.rows);
      } catch (error) {
        console.error("İzinleri getirme hatası:", error);
        return res.status(500).json({ error: error.message });
      }
    }
    
    // Delete permission
    else if (path.match(/^\/api\/user-permissions\/[^\/]+$/) && req.method === 'DELETE') {
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
    else if (path === '/api/change-password' && req.method === 'POST') {
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
    
    // -------------------- EMAIL ROUTES --------------------
    
    // Email sending endpoint
    else if (path === '/api/send-email-notification' && req.method === 'POST') {
      try {
        if (!apiInstance) {
          return res.status(500).json({ error: 'Email client not initialized properly' });
        }
        
        const { to, subject, text, html, from = 'ucanisplus@gmail.com', fromName = 'TLC Metal CRM', cc, bcc, replyTo } = req.body;
        
        if (!to || !subject || (!text && !html)) {
          return res.status(400).json({ error: 'Alıcı (to), konu (subject) ve mesaj içeriği (text veya html) gereklidir' });
        }
        
        // Format recipients correctly
        const toRecipients = Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }];
        
        // Format CC recipients (if provided)
        const ccRecipients = cc ? (Array.isArray(cc) ? cc.map(email => ({ email })) : [{ email: cc }]) : [];
        
        // Format BCC recipients (if provided)
        const bccRecipients = bcc ? (Array.isArray(bcc) ? bcc.map(email => ({ email })) : [{ email: bcc }]) : [];
        
        // Create email message
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
        sendSmtpEmail.sender = { name: fromName, email: from || 'ucanisplus@gmail.com' };
        sendSmtpEmail.to = toRecipients;
        
        // Add optional fields
        if (ccRecipients.length > 0) sendSmtpEmail.cc = ccRecipients;
        if (bccRecipients.length > 0) sendSmtpEmail.bcc = bccRecipients;
        if (replyTo) sendSmtpEmail.replyTo = { email: replyTo };
        if (text) sendSmtpEmail.textContent = text;
        
        console.log('📧 Sending email:', {
          to: Array.isArray(to) ? to.join(', ') : to,
          from: from || 'ucanisplus@gmail.com',
          subject
        });
        
        // Send the email
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        
        console.log('✅ Email sent successfully:', data);
        return res.status(200).json({ success: true, message: 'E-posta başarıyla gönderildi', data });
      } catch (error) {
        console.error('❌ Email sending error:', error);
        
        // Check for Brevo-specific error messages
        if (error.response && error.response.body) {
          console.error('Brevo response error:', error.response.body);
          
          return res.status(500).json({
            error: 'E-posta gönderilemedi',
            details: error.message,
            brevoError: error.response.body
          });
        }
        
        return res.status(500).json({
          error: 'E-posta gönderilemedi',
          details: error.message
        });
      }
    }
    
    // -------------------- SPECIAL OPERATIONS ROUTES --------------------
    
    // Test database connection
    else if (path === '/api/test' && req.method === 'GET') {
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
    
    // Get next sequence number
    else if (path === '/api/gal_cost_cal_sequence/next' && req.method === 'GET') {
      try {
        const kod_2 = urlParams.searchParams.get('kod_2');
        const cap = urlParams.searchParams.get('cap');
        
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
    else if (path === '/api/check-recipes' && req.method === 'GET') {
      try {
        const mm_gt_id = urlParams.searchParams.get('mm_gt_id');
        const ym_gt_id = urlParams.searchParams.get('ym_gt_id');
        
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
    else if (path === '/api/gal_cost_cal_sal_requests/count' && req.method === 'GET') {
      try {
        const status = urlParams.searchParams.get('status');
        const created_by = urlParams.searchParams.get('created_by');
        
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
    else if (path.match(/^\/api\/gal_cost_cal_sal_requests\/[^\/]+\/approve$/) && req.method === 'PUT') {
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
    else if (path.match(/^\/api\/gal_cost_cal_sal_requests\/[^\/]+\/reject$/) && req.method === 'PUT') {
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
    
    // -------------------- DATABASE TABLE ROUTES --------------------
    // For all database tables (panel_cost_cal_* and gal_cost_cal_*)
    else if (path.match(/^\/api\/(panel_cost_cal_|gal_cost_cal_|crm_users|user_permissions|profile_pictures)(.*)$/)) {
      // Extract the table name from the URL path
      const pathParts = path.split('/').filter(part => part);
      let tableName = pathParts[1];
      let idFromPath = '';
      
      // Check for ID in path
      if (pathParts.length > 2 && !tableName.includes('sal_requests')) {
        idFromPath = pathParts[2];
      }
      
      // Special case for nested paths like gal_cost_cal_sal_requests/{id}/approve
      if (tableName.includes('sal_requests') && pathParts.length > 2 && 
          (pathParts[3] === 'approve' || pathParts[3] === 'reject' || pathParts[3] === 'count')) {
        return res.status(400).json({ error: 'Use the special endpoints for request operations' });
      }
      
      // Check if table is supported
      if (!tables.includes(tableName)) {
        return res.status(400).json({ error: `Unsupported table: ${tableName}` });
      }
      
      console.log('Table name:', tableName);
      console.log('ID from path:', idFromPath);
      
      // Handle GET requests
      if (req.method === 'GET') {
        // Get query parameters from URL
        const id = urlParams.searchParams.get('id') || idFromPath;
        const mm_gt_id = urlParams.searchParams.get('mm_gt_id');
        const ym_gt_id = urlParams.searchParams.get('ym_gt_id');
        const ym_st_id = urlParams.searchParams.get('ym_st_id');
        const kod_2 = urlParams.searchParams.get('kod_2');
        const cap = urlParams.searchParams.get('cap');
        const stok_kodu = urlParams.searchParams.get('stok_kodu');
        const stok_kodu_like = urlParams.searchParams.get('stok_kodu_like');
        const ids = urlParams.searchParams.get('ids');
        const status = urlParams.searchParams.get('status');
        const created_by = urlParams.searchParams.get('created_by');
        
        let query = `SELECT * FROM ${tableName}`;
        const queryParams = [];
        let whereConditions = [];
        
        // Build WHERE conditions based on query parameters
        if (id) {
          whereConditions.push(`id = $${queryParams.length + 1}`);
          queryParams.push(id);
        }
        
        if (mm_gt_id) {
          whereConditions.push(`mm_gt_id = $${queryParams.length + 1}`);
          queryParams.push(mm_gt_id);
        }
        
        if (ym_gt_id) {
          whereConditions.push(`ym_gt_id = $${queryParams.length + 1}`);
          queryParams.push(ym_gt_id);
        }
        
        if (ym_st_id) {
          whereConditions.push(`ym_st_id = $${queryParams.length + 1}`);
          queryParams.push(ym_st_id);
        }
        
        if (kod_2 && cap) {
          whereConditions.push(`kod_2 = $${queryParams.length + 1}`);
          queryParams.push(kod_2);
          
          // Convert comma decimals to dot format
          const normalizedCap = typeof cap === 'string' && cap.includes(',') 
            ? parseFloat(cap.replace(/,/g, '.')) // Global flag to replace all commas
            : parseFloat(cap);
          
          whereConditions.push(`cap = $${queryParams.length + 1}`);
          queryParams.push(normalizedCap);
        }
        
        if (stok_kodu) {
          whereConditions.push(`stok_kodu = $${queryParams.length + 1}`);
          queryParams.push(stok_kodu);
        }
        
        // Pattern search with LIKE operator
        if (stok_kodu_like) {
          whereConditions.push(`stok_kodu LIKE $${queryParams.length + 1}`);
          queryParams.push(`${stok_kodu_like}%`);
        }
        
        // Multiple ID search
        if (ids) {
          const idList = ids.split(',');
          whereConditions.push(`id IN (${idList.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`);
          idList.forEach(id => queryParams.push(id));
        }
        
        // Request status filtering
        if (status && tableName === 'gal_cost_cal_sal_requests') {
          whereConditions.push(`status = $${queryParams.length + 1}`);
          queryParams.push(status);
        }
        
        // User filtering
        if (created_by && tableName === 'gal_cost_cal_sal_requests') {
          whereConditions.push(`created_by = $${queryParams.length + 1}`);
          queryParams.push(created_by);
        }
        
        // Add WHERE conditions
        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        
        // Add sorting
        if (tableName === 'gal_cost_cal_sal_requests') {
          query += ` ORDER BY created_at DESC`;
        }
        
        console.log(`🔍 Query for ${tableName}:`, query);
        console.log("📝 Parameters:", queryParams);
        
        const result = await pool.query(query, queryParams);
        
        // API consistency: Always return an array, empty array for no results
        return res.json(result.rows);
      }
      
      // Handle POST requests (Add new record)
      else if (req.method === 'POST') {
        let data = req.body;
        
        // Data validation
        const validation = validateData(data);
        if (!validation.valid) {
          console.error(`❌ Data validation error for ${tableName}:`, validation.error);
          return res.status(400).json({ error: validation.error });
        }
        
        // Check if incoming data is an array
        if (Array.isArray(data)) {
          console.log(`📥 Adding array data to ${tableName} table (${data.length} items)`);
          
          // Process each item separately
          const results = [];
          
          for (const item of data) {
            try {
              // Normalize numeric values (convert commas to periods)
              const normalizedItem = normalizeData(item);
              
              // Skip if empty
              if (!normalizedItem || Object.keys(normalizedItem).length === 0) {
                console.warn(`⚠️ Skipping empty item:`, item);
                continue;
              }
              
              const columns = Object.keys(normalizedItem).join(', ');
              const placeholders = Object.keys(normalizedItem).map((_, index) => `$${index + 1}`).join(', ');
              const values = Object.values(normalizedItem);
              
              const query = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
              
              console.log(`📥 Adding: ${tableName} (array item)`);
              
              const result = await pool.query(query, values);
              results.push(result.rows[0]);
            } catch (itemError) {
              console.error(`❌ Item addition error:`, itemError);
              // Continue with other items even if one fails
              results.push({ error: itemError.message, item });
            }
          }
          
          if (results.length === 0) {
            return res.status(400).json({ error: 'No valid items could be added' });
          }
          
          return res.status(201).json(results);
        } else {
          // Normalize numeric values (convert commas to periods)
          data = normalizeData(data);
          
          // Check if data is empty after normalization
          if (!data || Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Empty data after normalization' });
          }
          
          const columns = Object.keys(data).join(', ');
          const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
          const values = Object.values(data);
          
          const query = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
          
          console.log(`📥 Adding: ${tableName}`);
          console.log("🧾 Columns:", columns);
          
          try {
            const result = await pool.query(query, values);
            
            // Special log for recipe additions
            if (tableName.endsWith('_recete')) {
              console.log(`✅ Recipe added successfully: ${tableName}, ID: ${result.rows[0].id}`);
            }
            
            return res.status(201).json(result.rows[0]);
          } catch (insertError) {
            // Special error handling for recipe tables
            if (tableName.endsWith('_recete')) {
              console.error(`❌ Error adding recipe: ${insertError.message}`);
              
              // Return user-friendly error message
              if (insertError.code === '23502') {  // not-null constraint
                return res.status(400).json({ 
                  error: 'Missing required fields for recipe',
                  details: insertError.detail || insertError.message 
                });
              } else if (insertError.code === '23505') {  // unique constraint
                return res.status(409).json({
                  error: 'This recipe already exists',
                  details: insertError.detail || insertError.message
                });
              } else {
                return res.status(500).json({
                  error: 'Error adding recipe',
                  details: insertError.message
                });
              }
            }
            
            throw insertError; // Continue with normal error handling for other tables
          }
        }
      }
      
      // Handle PUT requests (Update existing record)
      else if (req.method === 'PUT') {
        if (!idFromPath) {
          return res.status(400).json({ error: 'ID is required for update operations' });
        }
        
        // Data validation
        const validation = validateData(req.body);
        if (!validation.valid) {
          console.error(`❌ Data validation error for ${tableName}:`, validation.error);
          return res.status(400).json({ error: validation.error });
        }
        
        // Normalize numeric values (convert commas to periods)
        let data = normalizeData(req.body);
        
        // Check if data is empty
        if (!data || Object.keys(data).length === 0) {
          console.error(`❌ Empty data for ${tableName} (id: ${idFromPath})`);
          return res.status(400).json({ error: "No data to update" });
        }
        
        const updates = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
        const values = Object.values(data);
        
        const query = `UPDATE ${tableName} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length + 1} RETURNING *`;
        values.push(idFromPath);
        
        console.log(`🔄 Updating: ${tableName}`);
        console.log("🧾 Updates:", updates);
        
        const result = await pool.query(query, values);
        if (result.rows.length === 0) {
          console.error(`❌ Record not found: ${tableName}, ID: ${idFromPath}`);
          return res.status(404).json({ error: "Record not found" });
        }
        
        console.log(`✅ Update successful: ${tableName} (id: ${idFromPath})`);
        return res.json(result.rows[0]);
      }
      
      // Handle DELETE requests
      else if (req.method === 'DELETE') {
        if (!idFromPath) {
          return res.status(400).json({ error: 'ID is required for delete operations' });
        }
        
        // Start a transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Delete related records
          if (tableName === 'gal_cost_cal_mm_gt') {
            // Find related YMGT records
            const ymGtResult = await client.query('SELECT id FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [idFromPath]);
            console.log(`🔍 Found ${ymGtResult.rows.length} YMGT records`);
            
            // Delete recipes for each YMGT
            for (const ymGt of ymGtResult.rows) {
              try {
                await client.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ymGt.id]);
                console.log(`✅ YMGT recipe deleted: ${ymGt.id}`);
              } catch (error) {
                console.log(`⚠️ Error deleting YMGT recipe (${ymGt.id}):`, error.message);
              }
            }
            
            // Delete YMGT records
            try {
              const deletedYmGt = await client.query('DELETE FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [idFromPath]);
              console.log(`✅ YMGT records deleted: ${deletedYmGt.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting YMGT records:`, error.message);
            }
            
            // Delete MMGT-YMST relationships
            try {
              const deletedRelations = await client.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE mm_gt_id = $1', [idFromPath]);
              console.log(`✅ MMGT-YMST relationships deleted: ${deletedRelations.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting MMGT-YMST relationships:`, error.message);
            }
            
            // Delete MMGT recipes
            try {
              const deletedRecipes = await client.query('DELETE FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [idFromPath]);
              console.log(`✅ MMGT recipes deleted: ${deletedRecipes.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting MMGT recipes:`, error.message);
            }
          }
          
          // If YMGT is being deleted, delete related recipes
          if (tableName === 'gal_cost_cal_ym_gt') {
            try {
              const deletedRecipes = await client.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [idFromPath]);
              console.log(`✅ YMGT recipes deleted: ${deletedRecipes.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting YMGT recipes:`, error.message);
            }
          }
          
          // If YMST is being deleted, delete related MMGT-YMST relationships and recipes
          if (tableName === 'gal_cost_cal_ym_st') {
            try {
              const deletedRelations = await client.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE ym_st_id = $1', [idFromPath]);
              console.log(`✅ MMGT-YMST relationships deleted: ${deletedRelations.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting MMGT-YMST relationships:`, error.message);
            }
            
            try {
              const deletedRecipes = await client.query('DELETE FROM gal_cost_cal_ym_st_recete WHERE ym_st_id = $1', [idFromPath]);
              console.log(`✅ YMST recipes deleted: ${deletedRecipes.rowCount}`);
            } catch (error) {
              console.log(`⚠️ Error deleting YMST recipes:`, error.message);
            }
          }
          
          // Delete main record
          const query = `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`;
          const result = await client.query(query, [idFromPath]);
          
          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log(`❌ Record not found: ${tableName}, ID: ${idFromPath}`);
            return res.status(404).json({ error: "Record not found" });
          }
          
          await client.query('COMMIT');
          console.log(`✅ Successfully deleted: ${tableName}, ID: ${idFromPath}`);
          return res.json({ message: "Record successfully deleted", deletedRecord: result.rows[0] });
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`❌ Error deleting data from ${tableName} table:`, error);
          return res.status(500).json({ error: error.message });
        } finally {
          client.release();
        }
      }
    }
    
    else {
      return res.status(404).json({ error: 'Endpoint not found', path });
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ 
      error: 'Unexpected server error',
      details: error.message,
      stack: error.stack
    });
  }
};