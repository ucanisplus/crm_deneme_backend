require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors({
  origin: '*',  // Geliştirme için - üretime geçerken bu kısıtlanmalıdır
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// CORS Preflight kontrolü için OPTIONS yanıtı
app.options('*', cors());

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

// PostgreSQL Bağlantısı
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Database error handling
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Sayı formatını düzenleyen yardımcı fonksiyon - İYİLEŞTİRİLMİŞ
// Virgül yerine nokta kullanarak sayı formatını düzenler
const normalizeNumber = (value) => {
  // Null veya undefined değerleri null olarak döndür
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    // Boş string kontrolü
    if (value.trim() === '') {
      return null;
    }
    
    // Virgülleri noktalara çevir - global flag ile tüm virgülleri değiştir
    if (value.includes(',')) {
      return parseFloat(value.replace(/,/g, '.'));
    }
    
    // Sayısal değer mi kontrol et
    if (!isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
  }
  
  return value;
};

// Verileri işleyen yardımcı fonksiyon - virgüllü sayıları noktalı formata dönüştürür - İYİLEŞTİRİLMİŞ
const normalizeData = (data) => {
  // Null veya undefined değerleri kontrol et
  if (data === null || data === undefined) {
    return null;
  }
  
  // Dizi ise her öğeyi işle
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  // Nesne ise her değeri işle
  if (typeof data === 'object') {
    const normalizedData = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Boş string kontrolü
      if (typeof value === 'string' && value.trim() === '') {
        normalizedData[key] = null;
      }
      // Değer bir nesne veya dizi ise içeriğini de işle
      else if (value !== null && typeof value === 'object') {
        normalizedData[key] = normalizeData(value);
      } else {
        normalizedData[key] = normalizeNumber(value);
      }
    }
    
    return normalizedData;
  }
  
  // Diğer tüm durumlar için sayı normalizasyonu uygula
  return normalizeNumber(data);
};

// Veri doğrulama fonksiyonu - YENİ
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

// *************** YENİ EKLENEN TIMESTAMP FIX FONKSİYONU *************** //
/**
 * Fixes timestamp format issues like "2025" to proper PostgreSQL timestamps
 * @param {Object} data - Request data to sanitize
 * @returns {Object} - Sanitized data
 */
function sanitizeTimestamps(data) {
  // Handle null/undefined
  if (!data) return data;
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeTimestamps(item));
  }
  
  // Handle objects
  if (typeof data === 'object' && data !== null) {
    const result = {...data};
    
    for (const [key, value] of Object.entries(data)) {
      // Identify timestamp fields by naming convention
      if (key.endsWith('_at') || key.includes('_tarihi') || key.includes('_update') || key.includes('Date')) {
        if (value === null || value === undefined || value === '') {
          // Null values stay null
          result[key] = null;
        } else if (typeof value === 'string' && /^\d{4}$/.test(value)) {
          // Fix year-only values like "2025" by converting to proper timestamp
          const year = parseInt(value);
          if (year >= 1900 && year <= 2100) {
            result[key] = `${year}-01-01 00:00:00`;
            console.log(`🕒 Timestamp field "${key}" with value "${value}" converted to "${result[key]}"`);
          } else {
            result[key] = null;
          }
        } else if (typeof value === 'string' && value.trim() === '') {
          // Empty strings become null
          result[key] = null;
        } else if (typeof value === 'string') {
          // Try to fix other timestamp strings
          try {
            // Check if it's already in PostgreSQL format
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
              result[key] = value;
            } else {
              // Try to parse and convert to PostgreSQL format
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                // Format: YYYY-MM-DD HH:MM:SS
                const timestamp = date.toISOString().replace('T', ' ').split('.')[0];
                result[key] = timestamp;
                console.log(`🕒 Timestamp field "${key}" with value "${value}" converted to "${timestamp}"`);
              } else {
                result[key] = null;
              }
            }
          } catch (e) {
            // If parsing fails, set to null
            result[key] = null;
          }
        } else if (value instanceof Date) {
          // Convert Date objects to proper format
          result[key] = value.toISOString().replace('T', ' ').split('.')[0];
        } else {
          // Any other type becomes null
          result[key] = null;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Process nested objects
        result[key] = sanitizeTimestamps(value);
      }
    }
    
    return result;
  }
  
  // Return primitive values unchanged
  return data;
}

// Middleware to fix timestamps in all requests - YENİ EKLENEN
app.use((req, res, next) => {
  if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
    try {
      // Apply timestamp fixes to all POST/PUT requests
      const originalBody = {...req.body};
      req.body = sanitizeTimestamps(req.body);
      
      console.log('🕒 Timestamp sanitization applied to request');
      
      // Log specific timestamp fields for debugging
      if (typeof req.body === 'object' && req.body !== null) {
        Object.entries(req.body).forEach(([key, value]) => {
          if ((key.includes('_tarihi') || key.includes('_update') || key.endsWith('_at')) && 
              originalBody[key] !== value) {
            console.log(`🕒 Fixed timestamp field: ${key}: ${originalBody[key]} => ${value}`);
          }
        });
      }
    } catch (error) {
      console.error('Error sanitizing timestamps:', error);
      // Continue even if sanitization fails
    }
  }
  next();
});

// Test Rotası
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

// Kullanıcı Kayıt Rotası
app.post('/api/signup', async (req, res) => {
    const { username, password, email, role = 'engineer_1' } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'Eksik alanlar' });
    }

    try {
        // Kullanıcı zaten var mı kontrol et
        const existingUser = await pool.query('SELECT * FROM crm_users WHERE username = $1 OR email = $2', [username, email]);
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Kullanıcı adı veya email zaten kullanılıyor' });
        }

        // Şifreyi hash'le
        const hashedPassword = await bcrypt.hash(password, 10);

        // UUID ile kullanıcı oluştur
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

// Kullanıcı Girişi
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Eksik alanlar' });
    }

    try {
        // Kullanıcı adına göre kullanıcıyı bul
        const result = await pool.query('SELECT * FROM crm_users WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
        }

        const user = result.rows[0];

        // Şifreyi hash'lenmiş şifre ile karşılaştır
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

// Kullanıcı izinlerini getir
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

// Tüm kullanıcıları getir (admin panel için)
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

// Kullanıcı güncelle
app.put('/api/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { username, email, role } = req.body;
        
        // Bu endpoint üzerinden şifre güncellemesine izin verme
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

// Kullanıcı sil
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

// Kullanıcı izni ekle
app.post('/api/user-permissions', async (req, res) => {
    try {
        const { role, permission_name } = req.body;
        
        if (!role || !permission_name) {
            return res.status(400).json({ error: 'Gerekli alanlar eksik' });
        }
        
        // İzin zaten var mı kontrol et
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

// Tüm izinleri getir
app.get('/api/user-permissions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM user_permissions ORDER BY role, permission_name');
        res.json(result.rows);
    } catch (error) {
        console.error("İzinleri getirme hatası:", error);
        res.status(500).json({ error: error.message });
    }
});

// İzin sil
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

// Şifre değiştir
app.post('/api/change-password', async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;
        
        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Gerekli alanlar eksik' });
        }
        
        // Kullanıcıyı getir
        const userResult = await pool.query('SELECT * FROM crm_users WHERE id = $1', [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        const user = userResult.rows[0];
        
        // Mevcut şifreyi doğrula
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Mevcut şifre yanlış' });
        }
        
        // Yeni şifreyi hashle ve güncelle
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

// Profil resmi getir
app.get('/api/user/profile-picture', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli' });
    }
    
    // Tablo adı profile_pictures (alt çizgi ile)
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

// Profil resmi oluştur veya güncelle
app.post('/api/user/profile-picture', async (req, res) => {
  try {
    const { username, pp_url } = req.body;
    
    if (!username || !pp_url) {
      return res.status(400).json({ error: 'Kullanıcı adı ve profil resmi URL\'si gerekli' });
    }
    
    // Kullanıcı için profil resmi zaten var mı kontrol et
    const existingPP = await pool.query(`
      SELECT * FROM profile_pictures 
      WHERE username = $1
    `, [username]);
    
    let result;
    
    if (existingPP.rows.length > 0) {
      // Mevcut profil resmini güncelle
      result = await pool.query(`
        UPDATE profile_pictures 
        SET pp_url = $1 
        WHERE username = $2 
        RETURNING *
      `, [pp_url, username]);
    } else {
      // Yeni profil resmi girişi oluştur
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

// Mevcut Tablolar
const tables = [
    'panel_cost_cal_currency',
    'panel_cost_cal_gecici_hesaplar',
    'panel_cost_cal_genel_degiskenler',
    'panel_cost_cal_maliyet_listesi',
    'panel_cost_cal_panel_cit_degiskenler',
    'panel_cost_cal_panel_list',
    'panel_cost_cal_profil_degiskenler',
    'panel_cost_cal_statik_degiskenler',

    // Galvanizli Tel tabloları
    'gal_cost_cal_mm_gt',
    'gal_cost_cal_ym_gt',
    'gal_cost_cal_ym_st',
    'gal_cost_cal_mm_gt_recete',
    'gal_cost_cal_ym_gt_recete',
    'gal_cost_cal_ym_st_recete',
    'gal_cost_cal_mm_gt_ym_st',
    'gal_cost_cal_sequence',
    'gal_cost_cal_sal_requests' // Yeni talepler tablosu ekledik
];

// Tablo varlığını kontrol et, yoksa oluştur
async function checkAndCreateTable(tableName) {
  try {
    // Tablo var mı kontrol et
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    if (!checkResult.rows[0].exists) {
      console.log(`Tablo '${tableName}' bulunamadı, oluşturuluyor...`);
      
      let createTableQuery = '';
      
      // Tablo tipine göre oluştur
      if (tableName === 'gal_cost_cal_sal_requests') {
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT 'pending',
            data JSONB NOT NULL,
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
            unwinding VARCHAR(50)
          )
        `;
      } else if (tableName.endsWith('_recete')) {
        // Reçete tabloları
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
        // MM GT - YM ST ilişki tablosu
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
        // Genel tablolar
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
      console.log(`Tablo '${tableName}' başarıyla oluşturuldu.`);
    }
  } catch (error) {
    console.error(`Tablo kontrol/oluşturma hatası (${tableName}):`, error);
    throw error;
  }
}

// Uygulama başladığında tüm tabloları kontrol et
async function checkAllTables() {
  try {
    console.log("Tablolar kontrol ediliyor...");
    for (const tableName of tables) {
      await checkAndCreateTable(tableName);
    }
    console.log("Tüm tablolar kontrol edildi ve gerekirse oluşturuldu.");
  } catch (error) {
    console.error("Tablo kontrol hatası:", error);
  }
}

// Uygulama başlatıldığında tabloları kontrol et
checkAllTables();

// Veri Getirmek için Genel GET Rotası
for (const table of tables) {
    app.get(`/api/${table}`, async (req, res) => {
        try {
            // URL'den sorgu parametrelerini al
            const { id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, ids, status } = req.query;
            
            let query = `SELECT * FROM ${table}`;
            const queryParams = [];
            let whereConditions = [];
            
            // Sorgu parametrelerine göre WHERE koşullarını oluştur
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
                
                // Virgüllü değer varsa noktaya çevir
                const normalizedCap = typeof cap === 'string' && cap.includes(',') 
                    ? parseFloat(cap.replace(/,/g, '.')) // Global flag ile tüm virgülleri değiştir
                    : parseFloat(cap);
                
                whereConditions.push(`cap = $${queryParams.length + 1}`);
                queryParams.push(normalizedCap);
            }
            
            if (stok_kodu) {
                whereConditions.push(`stok_kodu = $${queryParams.length + 1}`);
                queryParams.push(stok_kodu);
            }
            
            // Pattern arama için LIKE operatörü
            if (stok_kodu_like) {
                whereConditions.push(`stok_kodu LIKE $${queryParams.length + 1}`);
                queryParams.push(`${stok_kodu_like}%`);
            }
            
            // Çoklu ID araması için
            if (ids) {
                const idList = ids.split(',');
                whereConditions.push(`id IN (${idList.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`);
                idList.forEach(id => queryParams.push(id));
            }
            
            // Talep durumu filtreleme
            if (status && table === 'gal_cost_cal_sal_requests') {
                whereConditions.push(`status = $${queryParams.length + 1}`);
                queryParams.push(status);
            }
            
            // WHERE koşullarını ekle
            if (whereConditions.length > 0) {
                query += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            // Sıralama ekle
            if (table === 'gal_cost_cal_sal_requests') {
                query += ` ORDER BY created_at DESC`;
            }
            
            console.log(`🔍 ${table} için sorgu:`, query);
            console.log("📝 Parametreler:", queryParams);
            
            const result = await pool.query(query, queryParams);
            
            // API tutarlılığı: Her zaman dizi döndür, boş sonuç için boş dizi
            res.json(result.rows);
        } catch (error) {
            console.error(`${table} tablosundan veri getirme hatası:`, error);
            res.status(500).json({ 
              error: `${table} tablosundan veri getirme başarısız`,
              details: error.message,
              code: error.code
            });
        }
    });
}

// Talep sayısını getir
app.get('/api/gal_cost_cal_sal_requests/count', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT COUNT(*) FROM gal_cost_cal_sal_requests';
    const queryParams = [];
    
    if (status) {
      query += ' WHERE status = $1';
      queryParams.push(status);
    }
    
    const result = await pool.query(query, queryParams);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Talep sayısı alma hatası:', error);
    res.status(500).json({ error: 'Talep sayısı alınamadı' });
  }
});

// Talep onaylama
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
      return res.status(404).json({ error: 'Talep bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Talep onaylama hatası:', error);
    res.status(500).json({ error: 'Talep onaylanamadı: ' + error.message });
  }
});

// Talep reddetme
app.put('/api/gal_cost_cal_sal_requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { processed_by, rejection_reason } = req.body;
    
    if (!rejection_reason) {
      return res.status(400).json({ error: 'Reddetme sebebi gereklidir' });
    }
    
    const query = `
      UPDATE gal_cost_cal_sal_requests
      SET status = 'rejected', processed_by = $1, rejection_reason = $2, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [processed_by, rejection_reason, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Talep bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Talep reddetme hatası:', error);
    res.status(500).json({ error: 'Talep reddedilemedi: ' + error.message });
  }
});

// Veri Eklemek için Genel POST Rotası
for (const table of tables) {
    app.post(`/api/${table}`, async (req, res) => {
        try {
            let data = req.body;
            
            // Veri doğrulama
            const validation = validateData(data);
            if (!validation.valid) {
              console.error(`❌ ${table} için veri doğrulama hatası:`, validation.error);
              return res.status(400).json({ error: validation.error });
            }
            
            // Gelen veri bir dizi mi kontrol et
            if (Array.isArray(data)) {
                console.log(`📥 ${table} tablosuna dizi veri ekleniyor (${data.length} öğe)`);
                
                // Her bir öğeyi ayrı ayrı işle
                const results = [];
                
                for (const item of data) {
                    try {
                      // Sayı değerlerini normalize et (virgülleri noktalara çevir)
                      const normalizedItem = normalizeData(item);
                      
                      // Boş değilse devam et
                      if (!normalizedItem || Object.keys(normalizedItem).length === 0) {
                        console.warn(`⚠️ Boş öğe atlanıyor:`, item);
                        continue;
                      }
                      
                      const columns = Object.keys(normalizedItem).join(', ');
                      const placeholders = Object.keys(normalizedItem).map((_, index) => `$${index + 1}`).join(', ');
                      const values = Object.values(normalizedItem);
                      
                      const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                      
                      console.log(`📥 Ekleniyor: ${table} (dizi öğesi)`);
                      
                      const result = await pool.query(query, values);
                      results.push(result.rows[0]);
                    } catch (itemError) {
                      console.error(`❌ Öğe ekleme hatası:`, itemError);
                      // Hata olduğunda diğer öğeleri etkilememek için devam et
                      results.push({ error: itemError.message, item });
                    }
                }
                
                if (results.length === 0) {
                  return res.status(400).json({ error: 'Hiçbir geçerli öğe eklenemedi' });
                }
                
                res.status(201).json(results);
            } else {
                // Sayı değerlerini normalize et (virgülleri noktalara çevir)
                data = normalizeData(data);
                
                // Veri onaylandıktan sonra boş olabilir mi kontrol et
                if (!data || Object.keys(data).length === 0) {
                  return res.status(400).json({ error: 'Normalleştirmeden sonra boş veri kaldı' });
                }
                
                const columns = Object.keys(data).join(', ');
                const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
                const values = Object.values(data);
                
                const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                
                console.log(`📥 Ekleniyor: ${table}`);
                console.log("🧾 Sütunlar:", columns);
                
                const result = await pool.query(query, values);
                res.status(201).json(result.rows[0]);
            }
        } catch (error) {
            console.error(`❌ '${table}' tablosuna ekleme başarısız:`, error);
            console.error("🧾 Veri:", req.body);
            
            // Daha detaylı hata yanıtları
            if (error.code === '23505') {
              return res.status(409).json({ 
                error: 'Aynı kayıt zaten var',
                details: error.detail || error.message,
                code: error.code
              });
            } else if (error.code === '22P02') {
              return res.status(400).json({ 
                error: 'Geçersiz veri tipi',
                details: error.message,
                code: error.code
              });
            } else if (error.code === '23502') {
              return res.status(400).json({ 
                error: 'Zorunlu alan eksik',
                details: error.message,
                code: error.code
              });
            }
            
            res.status(500).json({ 
                error: `${table} tablosuna veri eklenemedi`,
                details: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    });
}

// Veri Güncellemek için Genel PUT Rotası
for (const table of tables) {
    app.put(`/api/${table}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            
            // Console log to debug the request
            console.log(`🔄 PUT Request to ${table}/${id}`);
            console.log("🧾 Request Body:", JSON.stringify(req.body));
            
            // Veri doğrulama
            const validation = validateData(req.body);
            if (!validation.valid) {
              console.error(`❌ ${table} için veri doğrulama hatası:`, validation.error);
              return res.status(400).json({ error: validation.error });
            }
            
            // Sayı değerlerini normalize et (virgülleri noktalara çevir)
            const data = normalizeData(req.body);
            
            // Eğer data boş ise hata döndür
            if (!data || Object.keys(data).length === 0) {
                console.error(`❌ ${table} için boş veri (id: ${id})`);
                return res.status(400).json({ error: "Güncellenecek veri yok" });
            }
            
            const updates = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
            const values = Object.values(data);
            
            const query = `UPDATE ${table} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length + 1} RETURNING *`;
            values.push(id);
            
            console.log(`🔄 Güncelleniyor: ${table}`);
            console.log("🧾 Güncellemeler:", updates);
            console.log("🔍 SQL Query:", query);
            
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                console.error(`❌ Kayıt bulunamadı: ${table} (id: ${id})`);
                return res.status(404).json({ error: "Kayıt bulunamadı" });
            }
            
            console.log(`✅ Güncelleme başarılı: ${table} (id: ${id})`);
            // Tutarlı API yanıtı - her zaman tek bir nesne döndür
            res.json(result.rows[0]);
        } catch (error) {
            console.error(`❌ ${table} tablosunda veri güncelleme hatası:`, error);
            
            // Daha detaylı hata yanıtları
            if (error.code === '23505') {
              return res.status(409).json({ 
                error: 'Aynı kayıt zaten var',
                details: error.detail || error.message,
                code: error.code
              });
            } else if (error.code === '22P02') {
              return res.status(400).json({ 
                error: 'Geçersiz veri tipi',
                details: error.message,
                code: error.code
              });
            }
            
            res.status(500).json({ 
                error: `${table} tablosunda veri güncellenemedi`,
                details: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    });
}

// Tüm Geçici Hesapları Silme
app.delete('/api/panel_cost_cal_gecici_hesaplar/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM panel_cost_cal_gecici_hesaplar');
    res.json({ message: 'Tüm geçici kayıtlar silindi.' });
  } catch (error) {
    console.error("Tüm geçici hesapları silme hatası:", error);
    res.status(500).json({ error: error.message });
  }
});

// Tüm Maliyet Listesini Silme
app.delete('/api/panel_cost_cal_maliyet_listesi/all', async (req, res) => {
  try {
    await pool.query('DELETE FROM panel_cost_cal_maliyet_listesi');
    res.json({ message: 'Tüm maliyet kayıtları silindi.' });
  } catch (error) {
    console.error("Tüm maliyet listesini silme hatası:", error);
    res.status(500).json({ error: error.message });
  }
});

// İlişkili Kayıtları Silme Yardımcı Fonksiyonu - İyileştirilmiş hata yönetimi
async function deleteRelatedRecords(table, id) {
  try {
    console.log(`🧹 ${table} tablosundan ID:${id} için ilişkili kayıtlar siliniyor...`);
    
    // MM GT siliniyorsa, ilgili YM GT ve ilişkili reçeteleri sil
    if (table === 'gal_cost_cal_mm_gt') {
      try {
        // İlişkili YM GT kayıtlarını bul
        const ymGtResult = await pool.query('SELECT id FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
        console.log(`🔍 Bulunan YM GT sayısı: ${ymGtResult.rows.length}`);
        
        // Her bir YM GT için ilişkili reçeteleri sil
        for (const ymGt of ymGtResult.rows) {
          try {
            await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ymGt.id]);
            console.log(`✅ YM GT reçetesi silindi: ${ymGt.id}`);
          } catch (error) {
            console.log(`⚠️ YM GT reçetesi silinirken hata (${ymGt.id}):`, error.message);
          }
        }
        
        // YM GT kayıtlarını sil
        try {
          const deletedYmGt = await pool.query('DELETE FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
          console.log(`✅ YM GT kayıtları silindi: ${deletedYmGt.rowCount}`);
        } catch (error) {
          console.log(`⚠️ YM GT kayıtları silinirken hata:`, error.message);
        }
        
        // MM GT-YM ST ilişkilerini sil
        try {
          const deletedRelations = await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE mm_gt_id = $1', [id]);
          console.log(`✅ MM GT-YM ST ilişkileri silindi: ${deletedRelations.rowCount}`);
        } catch (error) {
          console.log(`⚠️ MM GT-YM ST ilişkileri silinirken hata:`, error.message);
        }
        
        // MM GT reçetelerini sil
        try {
          const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [id]);
          console.log(`✅ MM GT reçeteleri silindi: ${deletedRecipes.rowCount}`);
        } catch (error) {
          console.log(`⚠️ MM GT reçeteleri silinirken hata:`, error.message);
        }
      } catch (error) {
        console.error(`❌ MM GT ilişkili kayıtları silinirken hata:`, error);
      }
    }
    
    // YM GT siliniyorsa, ilişkili reçeteleri sil
    if (table === 'gal_cost_cal_ym_gt') {
      try {
        const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [id]);
        console.log(`✅ YM GT reçeteleri silindi: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ YM GT reçeteleri silinirken hata:`, error.message);
      }
    }
    
    // YM ST siliniyorsa, ilişkili MM GT-YM ST ilişkilerini ve reçeteleri sil
    if (table === 'gal_cost_cal_ym_st') {
      try {
        const deletedRelations = await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE ym_st_id = $1', [id]);
        console.log(`✅ MM GT-YM ST ilişkileri silindi: ${deletedRelations.rowCount}`);
      } catch (error) {
        console.log(`⚠️ MM GT-YM ST ilişkileri silinirken hata:`, error.message);
      }
      
      try {
        const deletedRecipes = await pool.query('DELETE FROM gal_cost_cal_ym_st_recete WHERE ym_st_id = $1', [id]);
        console.log(`✅ YM ST reçeteleri silindi: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ YM ST reçeteleri silinirken hata:`, error.message);
      }
    }
    
    console.log(`✅ ${table} için ilişkili kayıtlar başarıyla silindi`);
    return true;
  } catch (error) {
    console.error(`❌ İlişkili kayıtları silme hatası (${table}, ${id}):`, error);
    // Hata durumunda da devam et, ana silme işlemini engelleme
    return false;
  }
}

// Veri Silmek için Genel DELETE Rotası (kademeli silme destekli)
for (const table of tables) {
    app.delete(`/api/${table}/:id`, async (req, res) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { id } = req.params;
            console.log(`🗑️ Siliniyor: ${table}, ID: ${id}`);
            
            // İlişkili kayıtları sil
            await deleteRelatedRecords(table, id);
            
            // Ana kaydı sil
            const query = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                console.log(`❌ Kayıt bulunamadı: ${table}, ID: ${id}`);
                return res.status(404).json({ error: "Kayıt bulunamadı" });
            }
            
            await client.query('COMMIT');
            console.log(`✅ Başarıyla silindi: ${table}, ID: ${id}`);
            res.json({ message: "Kayıt başarıyla silindi", deletedRecord: result.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ ${table} tablosundan veri silme hatası:`, error);
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    });
}

// Veritabanı şeması hakkında bilgi almak için özel endpoint - YENİ
app.get('/api/debug/table/:table', async (req, res) => {
  try {
    const { table } = req.params;
    
    // Tablo adını doğrula (SQL injection önleme)
    if (!tables.includes(table)) {
      return res.status(400).json({ error: 'Geçersiz tablo adı' });
    }
    
    // Tablo yapısını al
    const query = `
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM 
        information_schema.columns
      WHERE 
        table_name = $1
      ORDER BY 
        ordinal_position;
    `;
    
    const result = await pool.query(query, [table]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tablo bulunamadı' });
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Tablo şeması alma hatası:', error);
    res.status(500).json({ 
      error: 'Tablo şeması alınamadı',
      details: error.message
    });
  }
});

// Sıralı numara almak için endpoint
app.get('/api/gal_cost_cal_sequence/next', async (req, res) => {
  try {
    const { kod_2, cap } = req.query;
    
    if (!kod_2 || !cap) {
      return res.status(400).json({ error: 'kod_2 ve cap parametreleri gerekli' });
    }
    
    // Virgüllü cap değerini noktalı formata dönüştür
    let normalizedCap = cap;
    if (typeof cap === 'string' && cap.includes(',')) {
      normalizedCap = cap.replace(/,/g, '.');
    }
    
    // Formatı kontrol et
    const formattedCap = parseFloat(normalizedCap).toFixed(2).replace('.', '').padStart(4, '0');
    
    // Bu kombinasyon için en yüksek sıra numarasını bul
    const result = await pool.query(`
      SELECT MAX(CAST(SUBSTRING(stok_kodu FROM 10 FOR 2) AS INTEGER)) as max_seq
      FROM gal_cost_cal_mm_gt
      WHERE kod_2 = $1 AND stok_kodu LIKE $2
    `, [kod_2, `GT.${kod_2}.${formattedCap}.%`]);
    
    let nextSeq = 1;
    if (result.rows.length > 0 && result.rows[0].max_seq !== null) {
      nextSeq = result.rows[0].max_seq + 1;
    }
    
    // 2 basamaklı sıra numarası formatı
    const formattedSeq = nextSeq.toString().padStart(2, '0');
    
    res.json({ 
      next_sequence: nextSeq,
      formatted_sequence: formattedSeq,
      stok_kodu: `GT.${kod_2}.${formattedCap}.${formattedSeq}`
    });
  } catch (error) {
    console.error('Sıra numarası alma hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Yerel geliştirme için Sunucu Başlatma
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Backend ${PORT} portunda çalışıyor`);
    });
}

// Vercel için dışa aktar
module.exports = app;
