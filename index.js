// COMPLETE INDEX.JS WITH CORS CONFIGURATION AND EMAIL FUNCTIONALITY
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const SibApiV3Sdk = require('sib-api-v3-sdk');

const app = express();

// IMPROVED CORS CONFIGURATION: Single source of truth with specific origins
const allowedOrigins = [
  'https://crm-deneme-1.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

// SPECIAL CORS MIDDLEWARE FOR VERCEL SERVERLESS ENVIRONMENT
// Add a special middleware to handle preflight OPTIONS requests
app.use((req, res, next) => {
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    
    // Get the origin from the request
    const origin = req.headers.origin;
    
    // Set Access-Control-Allow-Origin header
    if (origin && allowedOrigins.indexOf(origin) !== -1) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      // Use wildcard for local development or first allowed origin
      res.header('Access-Control-Allow-Origin', '*');
    }
    
    // Set all the necessary CORS headers
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours cache for preflight
    
    // Return 200 OK status for preflight requests
    return res.status(200).end();
  }
  
  // For non-OPTIONS requests, continue to the next middleware
  next();
});

// Simple CORS middleware that works reliably in Vercel
app.use(cors({
  origin: '*', // Allow all origins for now to debug 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true
}));

// Increase JSON payload size limit and add better error handling
app.use(express.json({ limit: '10mb' }));

// JSON parse error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON Parse Error:', err.message);
    return res.status(400).json({ 
      error: 'Invalid JSON in request body',
      details: err.message
    });
  }
  next();
});

// EMERGENCY FIX: Remove timestamp fields that cause problems
app.use((req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    console.log('⚠️ EMERGENCY FIX - Removing timestamp fields in:', req.url);
    
    // Just remove any problematic timestamp fields
    const removeTimestamps = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => removeTimestamps(item));
      }
      
      // For objects, make a copy we can modify
      const result = {...obj};
      
      // Simply DELETE any field that might be a timestamp
      for (const key of Object.keys(result)) {
        // If it looks like a timestamp field, just delete it completely
        if (key.includes('_update') || key.includes('_tarihi') || 
            key.endsWith('_at') || key.includes('Date')) {
          console.log(`✂️ REMOVING problematic field: ${key}`);
          delete result[key];
        }
        // Handle nested objects
        else if (result[key] && typeof result[key] === 'object') {
          result[key] = removeTimestamps(result[key]);
        }
      }
      
      return result;
    };
    
    // Apply the fix to all requests
    req.body = removeTimestamps(req.body);
    console.log('📝 FIXED: All timestamp fields removed');
  }
  
  next();
});

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Database error handling
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Configure Brevo (Sendinblue) email client
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

// Email Sending Endpoint
app.post('/api/send-email-notification', async (req, res) => {
  console.log('📨 Email notification request received');
  
  try {
    if (!apiInstance) {
      return res.status(500).json({ error: 'Email client not initialized properly' });
    }
    
    const { to, subject, text, html, from = 'ucanisplus@gmail.com', fromName = 'TLC Metal CRM', cc, bcc, replyTo } = req.body;
    
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ error: 'Alıcı (to), konu (subject) ve mesaj içeriği (text veya html) gereklidir' });
    }
    
    // Format recipients correctly
    const toRecipients = Array.isArray(to) 
      ? to.map(email => ({ email })) 
      : [{ email: to }];
    
    // Format CC recipients (if provided)
    const ccRecipients = cc ? (Array.isArray(cc) 
      ? cc.map(email => ({ email })) 
      : [{ email: cc }]) : [];
    
    // Format BCC recipients (if provided)
    const bccRecipients = bcc ? (Array.isArray(bcc) 
      ? bcc.map(email => ({ email })) 
      : [{ email: bcc }]) : [];
    
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
    res.status(200).json({ success: true, message: 'E-posta başarıyla gönderildi', data });
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
    
    res.status(500).json({ 
      error: 'E-posta gönderilemedi', 
      details: error.message 
    });
  }
});

// Helper function for number formatting
const normalizeNumber = (value) => {
  // Return null for null or undefined values
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    // Empty string check
    if (value.trim() === '') {
      return null;
    }
    
    // Convert commas to dots - with global flag to replace all commas
    if (value.includes(',')) {
      return parseFloat(value.replace(/,/g, '.'));
    }
    
    // Check if it's a numeric value
    if (!isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
  }
  
  return value;
};

// Helper function to process data - converting comma decimals to period format
const normalizeData = (data) => {
  // Check for null or undefined values
  if (data === null || data === undefined) {
    return null;
  }
  
  // Process each item if it's an array
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  // Process each value if it's an object
  if (typeof data === 'object') {
    const normalizedData = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Check for empty string
      if (typeof value === 'string' && value.trim() === '') {
        normalizedData[key] = null;
      }
      // Process content if value is an object or array
      else if (value !== null && typeof value === 'object') {
        normalizedData[key] = normalizeData(value);
      } else {
        normalizedData[key] = normalizeNumber(value);
      }
    }
    
    return normalizedData;
  }
  
  // Apply number normalization for all other cases
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

// Test Route
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ message: "Veritabanı Bağlandı!", timestamp: result.rows[0].now });
    } catch (error) {
        console.error("Veritabanı Bağlantı Hatası:", error);
        res.status(500).json({ 
          error: "Veritabanı bağlantısı başarısız", 
          details: error.message 
        });
    }
});

// User Registration Route
app.post('/api/signup', async (req, res) => {
    console.log('📋 Signup request received');
    
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

        res.status(201).json({ message: 'Kullanıcı başarıyla oluşturuldu', user: result.rows[0] });
    } catch (error) {
        console.error("Kullanıcı kaydı hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    console.log('🔑 Login request received');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Eksik alanlar' });
    }

    try {
        // Find user by username
        const result = await pool.query('SELECT * FROM crm_users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        const user = result.rows[0];

        // Compare password with hashed password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        res.json({ 
            message: 'Giriş başarılı', 
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                role: user.role 
            } 
        });
    } catch (error) {
        console.error("Giriş hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get user permissions
app.get('/api/user/permissions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
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
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Kullanıcı izinleri getirme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users (for admin panel)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, email, role, created_at 
            FROM crm_users 
            ORDER BY created_at DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error("Kullanıcıları getirme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update user
app.put('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
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
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Kullanıcı güncelleme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user
app.delete('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            DELETE FROM crm_users
            WHERE id = $1
            RETURNING id, username
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        res.json({ message: 'Kullanıcı başarıyla silindi', deletedUser: result.rows[0] });
    } catch (error) {
        console.error("Kullanıcı silme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Add user permission
app.post('/api/user-permissions', async (req, res) => {
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
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("İzin ekleme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get all permissions
app.get('/api/user-permissions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM user_permissions ORDER BY role, permission_name');
        res.json(result.rows);
    } catch (error) {
        console.error("İzinleri getirme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete permission
app.delete('/api/user-permissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM user_permissions WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'İzin bulunamadı' });
        }
        
        res.json({ message: 'İzin başarıyla silindi', deletedPermission: result.rows[0] });
    } catch (error) {
        console.error("İzin silme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Change password
app.post('/api/change-password', async (req, res) => {
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
        
        res.json({ message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
        console.error("Şifre değiştirme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get profile picture
app.get('/api/user/profile-picture', async (req, res) => {
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
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Profil resmi getirme hatası:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update profile picture
app.post('/api/user/profile-picture', async (req, res) => {
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
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Profil resmi güncelleme hatası:", error);
    res.status(500).json({ error: error.message });
  }
});

// Existing Tables
const tables = [
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
    'gal_cost_cal_sal_requests', // Requests table
    'gal_cost_cal_user_input_values', // User input values for calculations
    'gal_cost_cal_user_tlc_hizlar' // TLC speeds table
];

// Check if table exists, create if it doesn't
async function checkAndCreateTable(tableName) {
  try {
    // Check if table exists
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    if (!checkResult.rows[0].exists) {
      console.log(`Table '${tableName}' not found, creating...`);
      
      let createTableQuery = '';
      
      // Create based on table type
      if (tableName === 'gal_cost_cal_user_input_values') {
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ash NUMERIC(10, 4) NOT NULL DEFAULT 5.54,
            lapa NUMERIC(10, 4) NOT NULL DEFAULT 2.73,
            uretim_kapasitesi_aylik INTEGER NOT NULL DEFAULT 2800,
            toplam_tuketilen_asit INTEGER NOT NULL DEFAULT 30000,
            ortalama_uretim_capi NUMERIC(10, 4) NOT NULL DEFAULT 3.08,
            paketlemeDkAdet INTEGER NOT NULL DEFAULT 10,
            created_by VARCHAR(255)
          )
        `;
      } else if (tableName === 'gal_cost_cal_user_tlc_hizlar') {
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            giris_capi NUMERIC(5,2) NOT NULL,
            cikis_capi NUMERIC(5,2) NOT NULL,
            kod VARCHAR(15) NOT NULL,
            total_red NUMERIC(12,9),
            kafa_sayisi INTEGER,
            calisma_hizi NUMERIC(5,2) NOT NULL,
            uretim_kg_saat NUMERIC(12,4),
            elektrik_sarfiyat_kw_sa NUMERIC(6,2),
            elektrik_sarfiyat_kw_ton NUMERIC(8,4)
          );
          
          -- Create indexes for improved performance
          CREATE INDEX idx_gal_cost_cal_user_tlc_hizlar_giris_cikis 
          ON ${tableName}(giris_capi, cikis_capi);
          
          CREATE INDEX idx_gal_cost_cal_user_tlc_hizlar_kod 
          ON ${tableName}(kod);
        `;
      } else if (tableName === 'gal_cost_cal_sal_requests') {
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT 'pending',
            data JSONB,
            title VARCHAR(255),
            description TEXT,
            created_by VARCHAR(255),
            processed_by VARCHAR(255),
            rejection_reason TEXT,
            processed_at TIMESTAMP WITH TIME ZONE,
            cap NUMERIC(10, 4),
            kod_2 VARCHAR(50),
            kaplama INT,
            min_mukavemet INT,
            max_mukavemet INT,
            kg INT,
            ic_cap INT,
            dis_cap INT,
            tolerans_plus NUMERIC(10, 4),
            tolerans_minus NUMERIC(10, 4),
            shrink VARCHAR(50),
            unwinding VARCHAR(50),
            cast_kont VARCHAR(50),
            helix_kont VARCHAR(50),
            elongation VARCHAR(50)
          )
        `;
      } else if (tableName.endsWith('_recete')) {
        // Recipe tables
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            mamul_kodu VARCHAR(255),
            bilesen_kodu VARCHAR(255),
            miktar NUMERIC(15, 8),
            sira_no INT,
            operasyon_bilesen VARCHAR(50),
            olcu_br VARCHAR(10),
            olcu_br_bilesen VARCHAR(10),
            aciklama TEXT,
            ua_dahil_edilsin VARCHAR(10),
            son_operasyon VARCHAR(10),
            uretim_suresi NUMERIC(15, 8),
            recete_top NUMERIC(10, 4),
            fire_orani NUMERIC(10, 8),
            mm_gt_id UUID,
            ym_gt_id UUID,
            ym_st_id UUID
          )
        `;
      } else if (tableName === 'gal_cost_cal_mm_gt_ym_st') {
        // MM GT - YM ST relationship table
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            mm_gt_id UUID NOT NULL,
            ym_st_id UUID NOT NULL,
            sira INT,
            UNIQUE(mm_gt_id, ym_st_id)
          )
        `;
      } else {
        // General tables - using TIMESTAMP WITH TIME ZONE for all tables
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            stok_kodu VARCHAR(255),
            stok_adi TEXT,
            aciklama TEXT,
            grup_kodu VARCHAR(50),
            kod_1 VARCHAR(50),
            kod_2 VARCHAR(50),
            muh_detay VARCHAR(50),
            depo_kodu VARCHAR(50),
            br_1 VARCHAR(10),
            br_2 VARCHAR(10),
            pay_1 INT,
            payda_1 NUMERIC(10, 3),
            cevrim_degeri_1 NUMERIC(10, 4),
            cevrim_pay_2 INT,
            cevrim_payda_2 INT,
            cevrim_degeri_2 NUMERIC(10, 4),
            cap NUMERIC(10, 4),
            kaplama INT,
            min_mukavemet INT,
            max_mukavemet INT,
            tolerans_plus NUMERIC(10, 4),
            tolerans_minus NUMERIC(10, 4),
            ic_cap INT,
            dis_cap INT,
            kg INT,
            mm_gt_id UUID,
            ym_gt_id UUID,
            ym_st_id UUID,
            filmasin INT,
            quality VARCHAR(10),
            satis_kdv_orani VARCHAR(10),
            alis_kdv_orani VARCHAR(10),
            stok_turu VARCHAR(10),
            esnek_yapilandir VARCHAR(10),
            super_recete_kullanilsin VARCHAR(10),
            alis_doviz_tipi INT,
            gumruk_tarife_kodu VARCHAR(50),
            ingilizce_isim TEXT,
            amb_shrink VARCHAR(50),
            shrink VARCHAR(50),
            unwinding VARCHAR(50),
            cast_kont VARCHAR(50),
            helix_kont VARCHAR(50),
            elongation VARCHAR(50),
            ozel_saha_1_say INT
          )
        `;
      }
      
      await pool.query(createTableQuery);
      console.log(`Table '${tableName}' created successfully.`);
    } else {
      // Check for timestamp columns in Panel Çit tables
      if (tableName.includes('panel_cit')) {
        // Check if we need to alter the timestamp columns
        const timestampColCheck = await pool.query(`
          SELECT data_type, column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND (column_name = 'created_at' OR column_name = 'updated_at' OR column_name LIKE '%_tarihi%' OR column_name LIKE '%_date%')
          AND data_type = 'timestamp without time zone'
        `, [tableName]);
        
        // If there are timestamp columns without timezone, alter them
        if (timestampColCheck.rows.length > 0) {
          console.log(`⚠️ Found timestamp fields without timezone in ${tableName}. Updating...`);
          
          // Alter each column using a transaction
          await pool.query('BEGIN');
          try {
            for (const row of timestampColCheck.rows) {
              console.log(`🔄 Updating ${row.column_name} field...`);
              
              await pool.query(`
                ALTER TABLE ${tableName} 
                ALTER COLUMN ${row.column_name} TYPE TIMESTAMP WITH TIME ZONE
              `);
              
              console.log(`✅ Field ${row.column_name} updated successfully.`);
            }
            
            await pool.query('COMMIT');
            console.log(`✅ All date fields in ${tableName} table updated to TIMESTAMP WITH TIME ZONE.`);
          } catch (error) {
            await pool.query('ROLLBACK');
            console.error(`❌ Error updating date fields in ${tableName} table:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Table check/creation error (${tableName}):`, error);
    throw error;
  }
}

// Check all tables when the application starts
async function checkAllTables() {
  try {
    console.log("Checking tables...");
    for (const tableName of tables) {
      await checkAndCreateTable(tableName);
    }
    console.log("All tables checked and created/updated if necessary.");
  } catch (error) {
    console.error("Table check error:", error);
  }
}

// Check tables when application starts
checkAllTables();

// Insert default calculation values on first run
async function insertDefaultUserInputValues() {
  try {
    // Add default values if no records exist
    const existingValues = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_user_input_values');
    
    if (parseInt(existingValues.rows[0].count) === 0) {
      console.log('Adding default calculation values...');
      
      await pool.query(`
        INSERT INTO gal_cost_cal_user_input_values 
        (ash, lapa, uretim_kapasitesi_aylik, toplam_tuketilen_asit, ortalama_uretim_capi, paketlemeDkAdet)
        VALUES (5.54, 2.73, 2800, 30000, 3.08, 10)
      `);
      
      console.log('✅ Default calculation values added successfully');
    }
  } catch (error) {
    console.error('❌ Error adding default calculation values:', error);
  }
}

// Add default values after tables are created
setTimeout(insertDefaultUserInputValues, 5000);

// General GET Route for Data Retrieval - with improved error handling
for (const table of tables) {
    app.get(`/api/${table}`, async (req, res) => {
        try {
            // Get query parameters from URL
            const { id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, ids, status, created_by } = req.query;
            
            let query = `SELECT * FROM ${table}`;
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
            if (status && table === 'gal_cost_cal_sal_requests') {
                whereConditions.push(`status = $${queryParams.length + 1}`);
                queryParams.push(status);
            }
            
            // User filtering
            if (created_by && table === 'gal_cost_cal_sal_requests') {
                whereConditions.push(`created_by = $${queryParams.length + 1}`);
                queryParams.push(created_by);
            }
            
            // Add WHERE conditions
            if (whereConditions.length > 0) {
                query += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            // Add sorting
            if (table === 'gal_cost_cal_sal_requests') {
                query += ` ORDER BY created_at DESC`;
            }
            
            console.log(`🔍 Query for ${table}:`, query);
            console.log("📝 Parameters:", queryParams);
            
            const result = await pool.query(query, queryParams);
            
            // API consistency: Always return an array, empty array for no results
            res.json(result.rows);
        } catch (error) {
            console.error(`Error getting data from ${table} table:`, error);
            
            // For recipe tables, return empty array on 404 error
            if (table.endsWith('_recete')) {
                console.log(`⚠️ No data found in ${table} table - returning empty array`);
                return res.json([]);
            }
            
            res.status(500).json({ 
              error: `Failed to get data from ${table} table`,
              details: error.message,
              code: error.code
            });
        }
    });
}

// Get request count
app.get('/api/gal_cost_cal_sal_requests/count', async (req, res) => {
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
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error getting request count:', error);
    res.status(500).json({ error: 'Failed to get request count' });
  }
});

// Approve request
app.put('/api/gal_cost_cal_sal_requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { processed_by } = req.body;
    
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
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: 'Could not approve request: ' + error.message });
  }
});

// Reject request
app.put('/api/gal_cost_cal_sal_requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { processed_by, rejection_reason } = req.body;
    
    if (!rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
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
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Could not reject request: ' + error.message });
  }
});

// Check if recipes are complete
app.get('/api/check-recipes', async (req, res) => {
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
    
    res.json({
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
    res.status(500).json({ 
      error: 'Error checking recipes',
      details: error.message
    });
  }
});

// General POST Route for Data Addition - with improved recipe handling
for (const table of tables) {
    app.post(`/api/${table}`, async (req, res) => {
        try {
            let data = req.body;
            
            // Data validation
            const validation = validateData(data);
            if (!validation.valid) {
              console.error(`❌ Data validation error for ${table}:`, validation.error);
              return res.status(400).json({ error: validation.error });
            }
            
            // Check if incoming data is an array
            if (Array.isArray(data)) {
                console.log(`📥 Adding array data to ${table} table (${data.length} items)`);
                
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
                      
                      const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                      
                      console.log(`📥 Adding: ${table} (array item)`);
                      
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
                
                res.status(201).json(results);
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
                
                const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                
                console.log(`📥 Adding: ${table}`);
                console.log("🧾 Columns:", columns);
                
                try {
                  const result = await pool.query(query, values);
                  
                  // Special log for recipe additions
                  if (table.endsWith('_recete')) {
                    console.log(`✅ Recipe added successfully: ${table}, ID: ${result.rows[0].id}`);
                  }
                  
                  res.status(201).json(result.rows[0]);
                } catch (insertError) {
                  // Special error handling for recipe tables
                  if (table.endsWith('_recete')) {
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
        } catch (error) {
            console.error(`❌ Failed to add to '${table}' table:`, error);
            console.error("🧾 Data:", req.body);
            
            // More detailed error responses
            if (error.code === '23505') {
              return res.status(409).json({ 
                error: 'Record already exists',
                details: error.detail || error.message,
                code: error.code
              });
            } else if (error.code === '22P02') {
              return res.status(400).json({ 
                error: 'Invalid data type',
                details: error.message,
                code: error.code
              });
            } else if (error.code === '23502') {
              return res.status(400).json({ 
                error: 'Missing required field',
                details: error.message,
                code: error.code
              });
            }
            
            res.status(500).json({ 
                error: `Could not add data to ${table} table`,
                details: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    });
}

// General PUT Route for Data Update
for (const table of tables) {
    app.put(`/api/${table}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            
            // Console log to debug the request
            console.log(`🔄 PUT Request to ${table}/${id}`);
            console.log("🧾 Request Body:", JSON.stringify(req.body));
            
            // Data validation
            const validation = validateData(req.body);
            if (!validation.valid) {
              console.error(`❌ Data validation error for ${table}:`, validation.error);
              return res.status(400).json({ error: validation.error });
            }
            
            // Normalize numeric values (convert commas to periods)
            let data = normalizeData(req.body);
            
            // Check if data is empty
            if (!data || Object.keys(data).length === 0) {
                console.error(`❌ Empty data for ${table} (id: ${id})`);
                return res.status(400).json({ error: "No data to update" });
            }
            
            const updates = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
            const values = Object.values(data);
            
            const query = `UPDATE ${table} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length + 1} RETURNING *`;
            values.push(id);
            
            console.log(`🔄 Updating: ${table}`);
            console.log("🧾 Updates:", updates);
            console.log("🔍 SQL Query:", query);
            
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                console.error(`❌ Record not found: ${table} (id: ${id})`);
                return res.status(404).json({ error: "Record not found" });
            }
            
            console.log(`✅ Update successful: ${table} (id: ${id})`);
            // Consistent API response - always return a single object
            res.json(result.rows[0]);
        } catch (error) {
            console.error(`❌ Error updating data in ${table} table:`, error);
            
            // More detailed error responses
            if (error.code === '23505') {
              return res.status(409).json({ 
                error: 'Record already exists',
                details: error.detail || error.message,
                code: error.code
              });
            } else if (error.code === '22P02') {
              return res.status(400).json({ 
                error: 'Invalid data type',
                details: error.message,
                code: error.code
              });
            }
            
            res.status(500).json({ 
                error: `Could not update data in ${table} table`,
                details: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    });
}

// Delete all temporary calculations
app.delete('/api/panel_cost_cal_gecici_hesaplar/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM panel_cost_cal_gecici_hesaplar');
    res.json({ message: 'All temporary records deleted.' });
  } catch (error) {
    console.error("Error deleting all temporary calculations:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete all cost list
app.delete('/api/panel_cost_cal_maliyet_listesi/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM panel_cost_cal_maliyet_listesi');
    res.json({ message: 'All cost records deleted.' });
  } catch (error) {
    console.error("Error deleting all cost list:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to delete related records - with improved error handling
async function deleteRelatedRecords(table, id) {
  try {
    console.log(`🧹 Deleting related records for ${table} ID:${id}...`);
    
    // If MMGT is being deleted, delete related YMGT and recipes
    if (table === 'gal_cost_cal_mm_gt') {
      try {
        // Find related YMGT records
        const ymGtResult = await pool.query('SELECT id FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
        console.log(`🔍 Found ${ymGtResult.rows.length} YMGT records`);
        
        // Delete recipes for each YMGT
        for (const ymGt of ymGtResult.rows) {
          try {
            await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ymGt.id]);
            console.log(`✅ YMGT recipe deleted: ${ymGt.id}`);
          } catch (error) {
            console.log(`⚠️ Error deleting YMGT recipe (${ymGt.id}):`, error.message);
          }
        }
        
        // Delete YMGT records
        try {
          const deletedYmGt = await pool.query('DELETE FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
          console.log(`✅ YMGT records deleted: ${deletedYmGt.rowCount}`);
        } catch (error) {
          console.log(`⚠️ Error deleting YMGT records:`, error.message);
        }
        
        // Delete MMGT-YMST relationships
        try {
          const deletedRelations = await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE mm_gt_id = $1', [id]);
          console.log(`✅ MMGT-YMST relationships deleted: ${deletedRelations.rowCount}`);
        } catch (error) {
          console.log(`⚠️ Error deleting MMGT-YMST relationships:`, error.message);
        }
        
        // Delete MMGT recipes
        try {
          const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [id]);
          console.log(`✅ MMGT recipes deleted: ${deletedRecipes.rowCount}`);
        } catch (error) {
          console.log(`⚠️ Error deleting MMGT recipes:`, error.message);
        }
      } catch (error) {
        console.error(`❌ Error deleting related MMGT records:`, error);
      }
    }
    
    // If YMGT is being deleted, delete related recipes
    if (table === 'gal_cost_cal_ym_gt') {
      try {
        const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [id]);
        console.log(`✅ YMGT recipes deleted: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Error deleting YMGT recipes:`, error.message);
      }
    }
    
    // If YMST is being deleted, delete related MMGT-YMST relationships and recipes
    if (table === 'gal_cost_cal_ym_st') {
      try {
        const deletedRelations = await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE ym_st_id = $1', [id]);
        console.log(`✅ MMGT-YMST relationships deleted: ${deletedRelations.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Error deleting MMGT-YMST relationships:`, error.message);
      }
      
      try {
        const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_ym_st_recete WHERE ym_st_id = $1', [id]);
        console.log(`✅ YMST recipes deleted: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Error deleting YMST recipes:`, error.message);
      }
    }
    
    console.log(`✅ Related records for ${table} deleted successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting related records (${table}, ${id}):`, error);
    // Continue with main deletion even if related deletions fail
    return false;
  }
}

// General DELETE Route for Data Deletion (with cascading delete support)
for (const table of tables) {
    app.delete(`/api/${table}/:id`, async (req, res) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { id } = req.params;
            console.log(`🗑️ Deleting: ${table}, ID: ${id}`);
            
            // Delete related records
            await deleteRelatedRecords(table, id);
            
            // Delete main record
            const query = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                console.log(`❌ Record not found: ${table}, ID: ${id}`);
                return res.status(404).json({ error: "Record not found" });
            }
            
            await client.query('COMMIT');
            console.log(`✅ Successfully deleted: ${table}, ID: ${id}`);
            res.json({ message: "Record successfully deleted", deletedRecord: result.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Error deleting data from ${table} table:`, error);
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    });
}

// Get next sequence number
app.get('/api/gal_cost_cal_sequence/next', async (req, res) => {
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
    
    res.json({ 
      next_sequence: nextSeq,
      formatted_sequence: formattedSeq,
      stok_kodu: `GT.${kod_2}.${formattedCap}.${formattedSeq}`
    });
  } catch (error) {
    console.error('Error getting sequence number:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a simple root route for testing
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Backend is running',
        cors: 'Enabled with wildcard (*) origin',
        timestamp: new Date().toISOString()
    });
});

// Start server for local development
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Backend running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
