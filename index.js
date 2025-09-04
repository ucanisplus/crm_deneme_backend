// COMPLETE FIXED VERSION OF INDEX.JS WITH TIMESTAMP ISSUE RESOLVED
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { Redis } = require('@upstash/redis');

const app = express();
// Enhanced CORS configuration for Vercel deployment
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: false
}));

// Explicit CORS middleware for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

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

// PostgreSQL Bağlantısı - OPTIMIZED CONFIGURATION
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Performance optimizations
    max: 20, // Increase max connections from default 10
    idleTimeoutMillis: 30000, // 30 seconds
    connectionTimeoutMillis: 10000, // 10 seconds
    statement_timeout: 60000, // 60 seconds for queries
    query_timeout: 60000 // 60 seconds
});

// Redis Configuration for Caching
let redis;
try {
  if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    });
    console.log('✅ Redis cache initialized successfully');
  } else {
    console.warn('⚠️ Redis not configured - running without cache');
    redis = null;
  }
} catch (error) {
  console.error('❌ Redis initialization failed:', error);
  redis = null;
}

// Redis Cache Helper Functions
const cacheHelpers = {
  // Generate cache key for table queries
  generateCacheKey: (table, filters = {}, page = null, limit = null) => {
    const filterString = Object.keys(filters).length > 0 ? 
      JSON.stringify(filters, Object.keys(filters).sort()) : 'no-filters';
    const pageString = page ? `page:${page}` : 'no-page';
    const limitString = limit ? `limit:${limit}` : 'no-limit';
    return `celik_hasir:${table}:${filterString}:${pageString}:${limitString}`;
  },

  // Get from cache
  get: async (key) => {
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      if (data) {
        console.log(`🎯 Cache HIT: ${key}`);
        return JSON.parse(data);
      }
      console.log(`💨 Cache MISS: ${key}`);
      return null;
    } catch (error) {
      console.error('Cache GET error:', error);
      return null;
    }
  },

  // Set to cache with TTL (default 5 minutes)
  set: async (key, data, ttlSeconds = 300) => {
    if (!redis) return false;
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      console.log(`💾 Cached: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      console.error('Cache SET error:', error);
      return false;
    }
  },

  // Delete from cache
  del: async (pattern) => {
    if (!redis) return false;
    try {
      if (pattern.includes('*')) {
        // Delete by pattern
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`🗑️ Cache cleared: ${keys.length} keys matching ${pattern}`);
        }
      } else {
        // Delete single key
        await redis.del(pattern);
        console.log(`🗑️ Cache cleared: ${pattern}`);
      }
      return true;
    } catch (error) {
      console.error('Cache DEL error:', error);
      return false;
    }
  },

  // Clear all cache for a table
  clearTableCache: async (table) => {
    return await cacheHelpers.del(`celik_hasir:${table}:*`);
  }
};

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
      // Skip normalization for text fields that should remain as strings
      const textFields = ['stok_adi', 'stok_kodu', 'ingilizce_isim', 'hasir_tipi', 'grup_kodu', 
                          'kod_1', 'kod_2', 'br_1', 'br_2', 'olcu_br_3', 'hasir_turu', 
                          'stok_turu', 'esnek_yapilandir', 'super_recete_kullanilsin',
                          'bilesen_kodu', 'olcu_br_bilesen', 'aciklama', 'operasyon_bilesen',
                          'goz_araligi', 'mamul_kodu'];
      
      if (textFields.includes(key)) {
        // Keep text fields as-is, just handle empty strings
        normalizedData[key] = (typeof value === 'string' && value.trim() === '') ? null : value;
      }
      // Boş string kontrolü
      else if (typeof value === 'string' && value.trim() === '') {
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
    'gal_cost_cal_sal_requests', // Talepler tablosu
    'gal_cost_cal_user_input_values', // Hesaplama değerleri için kullanıcı girdileri
    'gal_cost_cal_user_tlc_hizlar', // TLC Hızlar tablosu için

    // Çelik Hasır Netsis tabloları
    'celik_hasir_netsis_mm',
    'celik_hasir_netsis_ym_ncbk',
    'celik_hasir_netsis_ym_ntel',
    'celik_hasir_netsis_mm_recete',
    'celik_hasir_netsis_ncbk_recete',
    'celik_hasir_netsis_ntel_recete',
    'celik_hasir_netsis_sequence'
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
      } else if (tableName === 'celik_hasir_netsis_mm') {
        // Çelik Hasır MM (CH STOK) tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            user_id VARCHAR(255),
            stok_kodu VARCHAR(255) UNIQUE,
            stok_adi TEXT,
            grup_kodu VARCHAR(50) DEFAULT 'MM',
            kod_1 VARCHAR(50) DEFAULT 'HSR',
            kod_2 VARCHAR(50),
            ingilizce_isim TEXT,
            alis_kdv_orani VARCHAR(10) DEFAULT '20',
            satis_kdv_orani VARCHAR(10) DEFAULT '20',
            muh_detay VARCHAR(50) DEFAULT '31',
            depo_kodu VARCHAR(50) DEFAULT '36',
            br_1 VARCHAR(10) DEFAULT 'KG',
            br_2 VARCHAR(10) DEFAULT 'AD',
            pay_1 INT DEFAULT 1,
            payda_1 NUMERIC(10,3),
            cevrim_degeri_1 NUMERIC(10,6),
            olcu_br_3 VARCHAR(10),
            cevrim_pay_2 INT DEFAULT 1,
            cevrim_payda_2 INT DEFAULT 1,
            cevrim_degeri_2 NUMERIC(10,4) DEFAULT 1,
            hasir_tipi VARCHAR(20),
            cap NUMERIC(10,4),
            cap2 NUMERIC(10,4),
            ebat_boy NUMERIC(10,2),
            ebat_en NUMERIC(10,2),
            goz_araligi VARCHAR(50),
            kg NUMERIC(10,4),
            ic_cap_boy_cubuk_ad INT,
            dis_cap_en_cubuk_ad INT,
            ozel_saha_2_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_3_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_4_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_1_alf VARCHAR(255),
            ozel_saha_2_alf VARCHAR(255),
            ozel_saha_3_alf VARCHAR(255),
            alis_fiyati NUMERIC(15,4) DEFAULT 0,
            fiyat_birimi INT DEFAULT 2,
            satis_fiyati_1 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_2 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_3 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_4 NUMERIC(15,4) DEFAULT 0,
            doviz_tip INT DEFAULT 0,
            doviz_alis NUMERIC(15,4) DEFAULT 0,
            doviz_maliyeti NUMERIC(15,4) DEFAULT 0,
            doviz_satis_fiyati NUMERIC(15,4) DEFAULT 0,
            azami_stok NUMERIC(15,4) DEFAULT 0,
            asgari_stok NUMERIC(15,4) DEFAULT 0,
            dov_tutar NUMERIC(15,4) DEFAULT 0,
            dov_tipi VARCHAR(10),
            alis_doviz_tipi INT DEFAULT 0,
            bekleme_suresi INT DEFAULT 0,
            temin_suresi INT DEFAULT 0,
            birim_agirlik NUMERIC(10,6) DEFAULT 0,
            nakliye_tutar NUMERIC(15,4) DEFAULT 0,
            stok_turu VARCHAR(10) DEFAULT 'D',
            mali_grup_kodu VARCHAR(50),
            ozel_saha_8_alf VARCHAR(255),
            kod_3 VARCHAR(50),
            kod_4 VARCHAR(50),
            kod_5 VARCHAR(50),
            esnek_yapilandir VARCHAR(10) DEFAULT 'H',
            super_recete_kullanilsin VARCHAR(10) DEFAULT 'H',
            bagli_stok_kodu VARCHAR(255),
            yapilandirma_kodu VARCHAR(255),
            yap_aciklama TEXT,
            girislerde_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            cikislarda_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            hasir_sayisi INT,
            cubuk_sayisi_boy INT,
            cubuk_sayisi_en INT,
            adet_kg NUMERIC(10,4),
            toplam_kg NUMERIC(10,4),
            hasir_turu VARCHAR(100)
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_ym_ncbk') {
        // Çelik Hasır YM NCBK tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            user_id VARCHAR(255),
            stok_kodu VARCHAR(255) UNIQUE,
            stok_adi TEXT,
            grup_kodu VARCHAR(50) DEFAULT 'YM',
            kod_1 VARCHAR(50) DEFAULT 'NCBK',
            kod_2 VARCHAR(50),
            ingilizce_isim TEXT,
            alis_kdv_orani VARCHAR(10) DEFAULT '20',
            satis_kdv_orani VARCHAR(10) DEFAULT '20',
            muh_detay VARCHAR(50) DEFAULT '35',
            depo_kodu VARCHAR(50) DEFAULT '35',
            br_1 VARCHAR(10) DEFAULT 'AD',
            br_2 VARCHAR(10) DEFAULT 'KG',
            pay_1 NUMERIC(10,4),
            payda_1 NUMERIC(10,3) DEFAULT 1,
            cevrim_degeri_1 NUMERIC(10,6),
            olcu_br_3 VARCHAR(10),
            cevrim_pay_2 INT DEFAULT 1,
            cevrim_payda_2 INT DEFAULT 1,
            cevrim_degeri_2 NUMERIC(10,4) DEFAULT 1,
            hasir_tipi VARCHAR(20),
            cap NUMERIC(10,4),
            cap2 NUMERIC(10,4),
            ebat_boy NUMERIC(10,2),
            ebat_en NUMERIC(10,2),
            goz_araligi VARCHAR(50),
            kg NUMERIC(10,4),
            ic_cap_boy_cubuk_ad INT,
            dis_cap_en_cubuk_ad INT,
            ozel_saha_2_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_3_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_4_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_1_alf VARCHAR(255),
            ozel_saha_2_alf VARCHAR(255),
            ozel_saha_3_alf VARCHAR(255),
            alis_fiyati NUMERIC(15,4) DEFAULT 0,
            fiyat_birimi INT DEFAULT 2,
            satis_fiyati_1 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_2 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_3 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_4 NUMERIC(15,4) DEFAULT 0,
            doviz_tip INT DEFAULT 0,
            doviz_alis NUMERIC(15,4) DEFAULT 0,
            doviz_maliyeti NUMERIC(15,4) DEFAULT 0,
            doviz_satis_fiyati NUMERIC(15,4) DEFAULT 0,
            azami_stok NUMERIC(15,4) DEFAULT 0,
            asgari_stok NUMERIC(15,4) DEFAULT 0,
            dov_tutar NUMERIC(15,4) DEFAULT 0,
            dov_tipi VARCHAR(10),
            alis_doviz_tipi INT DEFAULT 0,
            bekleme_suresi INT DEFAULT 0,
            temin_suresi INT DEFAULT 0,
            birim_agirlik NUMERIC(10,6) DEFAULT 0,
            nakliye_tutar NUMERIC(15,4) DEFAULT 0,
            stok_turu VARCHAR(10) DEFAULT 'D',
            mali_grup_kodu VARCHAR(50),
            ozel_saha_8_alf VARCHAR(255),
            kod_3 VARCHAR(50),
            kod_4 VARCHAR(50),
            kod_5 VARCHAR(50),
            esnek_yapilandir VARCHAR(10) DEFAULT 'H',
            super_recete_kullanilsin VARCHAR(10) DEFAULT 'H',
            bagli_stok_kodu VARCHAR(255),
            yapilandirma_kodu VARCHAR(255),
            yap_aciklama TEXT,
            girislerde_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            cikislarda_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            length_cm INT,
            parent_ch_id UUID
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_ym_ntel') {
        // Çelik Hasır YM NTEL tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            user_id VARCHAR(255),
            stok_kodu VARCHAR(255) UNIQUE,
            stok_adi TEXT,
            grup_kodu VARCHAR(50) DEFAULT 'YM',
            kod_1 VARCHAR(50) DEFAULT 'NTEL',
            kod_2 VARCHAR(50),
            ingilizce_isim TEXT,
            alis_kdv_orani VARCHAR(10) DEFAULT '20',
            satis_kdv_orani VARCHAR(10) DEFAULT '20',
            muh_detay VARCHAR(50) DEFAULT '35',
            depo_kodu VARCHAR(50) DEFAULT '35',
            br_1 VARCHAR(10) DEFAULT 'MT',
            br_2 VARCHAR(10) DEFAULT 'KG',
            pay_1 NUMERIC(10,4),
            payda_1 NUMERIC(10,3) DEFAULT 1,
            cevrim_degeri_1 NUMERIC(10,6),
            olcu_br_3 VARCHAR(10),
            cevrim_pay_2 INT DEFAULT 1,
            cevrim_payda_2 INT DEFAULT 1,
            cevrim_degeri_2 NUMERIC(10,4) DEFAULT 1,
            hasir_tipi VARCHAR(20),
            cap NUMERIC(10,4),
            cap2 NUMERIC(10,4),
            ebat_boy NUMERIC(10,2),
            ebat_en NUMERIC(10,2),
            goz_araligi VARCHAR(50),
            kg NUMERIC(10,4),
            ic_cap_boy_cubuk_ad INT,
            dis_cap_en_cubuk_ad INT,
            ozel_saha_2_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_3_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_4_say NUMERIC(10,4) DEFAULT 0,
            ozel_saha_1_alf VARCHAR(255),
            ozel_saha_2_alf VARCHAR(255),
            ozel_saha_3_alf VARCHAR(255),
            alis_fiyati NUMERIC(15,4) DEFAULT 0,
            fiyat_birimi INT DEFAULT 2,
            satis_fiyati_1 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_2 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_3 NUMERIC(15,4) DEFAULT 0,
            satis_fiyati_4 NUMERIC(15,4) DEFAULT 0,
            doviz_tip INT DEFAULT 0,
            doviz_alis NUMERIC(15,4) DEFAULT 0,
            doviz_maliyeti NUMERIC(15,4) DEFAULT 0,
            doviz_satis_fiyati NUMERIC(15,4) DEFAULT 0,
            azami_stok NUMERIC(15,4) DEFAULT 0,
            asgari_stok NUMERIC(15,4) DEFAULT 0,
            dov_tutar NUMERIC(15,4) DEFAULT 0,
            dov_tipi VARCHAR(10),
            alis_doviz_tipi INT DEFAULT 0,
            bekleme_suresi INT DEFAULT 0,
            temin_suresi INT DEFAULT 0,
            birim_agirlik NUMERIC(10,6) DEFAULT 0,
            nakliye_tutar NUMERIC(15,4) DEFAULT 0,
            stok_turu VARCHAR(10) DEFAULT 'D',
            mali_grup_kodu VARCHAR(50),
            ozel_saha_8_alf VARCHAR(255),
            kod_3 VARCHAR(50),
            kod_4 VARCHAR(50),
            kod_5 VARCHAR(50),
            esnek_yapilandir VARCHAR(10) DEFAULT 'H',
            super_recete_kullanilsin VARCHAR(10) DEFAULT 'H',
            bagli_stok_kodu VARCHAR(255),
            yapilandirma_kodu VARCHAR(255),
            yap_aciklama TEXT,
            girislerde_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            cikislarda_seri_numarasi_takibi VARCHAR(10) DEFAULT 'E',
            parent_ch_id UUID
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_mm_recete') {
        // Çelik Hasır MM Reçete tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            mamul_kodu VARCHAR(255),
            recete_top NUMERIC(10,4) DEFAULT 1,
            fire_orani NUMERIC(10,6) DEFAULT 0,
            oto_rec VARCHAR(10),
            olcu_br VARCHAR(10),
            sira_no INT,
            operasyon_bilesen VARCHAR(50),
            bilesen_kodu VARCHAR(255),
            olcu_br_bilesen VARCHAR(10),
            miktar NUMERIC(15,6),
            aciklama TEXT,
            miktar_sabitle VARCHAR(10),
            stok_maliyet VARCHAR(10),
            fire_mik NUMERIC(15,6),
            sabit_fire_mik NUMERIC(15,6),
            istasyon_kodu VARCHAR(50),
            hazirlik_suresi NUMERIC(15,6),
            uretim_suresi NUMERIC(15,6),
            ua_dahil_edilsin VARCHAR(10),
            son_operasyon VARCHAR(10),
            oncelik INT,
            planlama_orani NUMERIC(10,4),
            alternatif_politika_da_transfer VARCHAR(50),
            alternatif_politika_ambar_c VARCHAR(50),
            alternatif_politika_uretim_s VARCHAR(50),
            alternatif_politika_mrp VARCHAR(50),
            ic_dis VARCHAR(10),
            mm_id UUID REFERENCES celik_hasir_netsis_mm(id) ON DELETE CASCADE
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_ncbk_recete') {
        // Çelik Hasır NCBK Reçete tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            mamul_kodu VARCHAR(255),
            recete_top NUMERIC(10,4) DEFAULT 1,
            fire_orani NUMERIC(10,6) DEFAULT 0,
            oto_rec VARCHAR(10),
            olcu_br VARCHAR(10),
            sira_no INT,
            operasyon_bilesen VARCHAR(50),
            bilesen_kodu VARCHAR(255),
            olcu_br_bilesen VARCHAR(10),
            miktar NUMERIC(15,6),
            aciklama TEXT,
            miktar_sabitle VARCHAR(10),
            stok_maliyet VARCHAR(10),
            fire_mik NUMERIC(15,6),
            sabit_fire_mik NUMERIC(15,6),
            istasyon_kodu VARCHAR(50),
            hazirlik_suresi NUMERIC(15,6),
            uretim_suresi NUMERIC(15,6),
            ua_dahil_edilsin VARCHAR(10),
            son_operasyon VARCHAR(10),
            oncelik INT,
            planlama_orani NUMERIC(10,4),
            alternatif_politika_da_transfer VARCHAR(50),
            alternatif_politika_ambar_c VARCHAR(50),
            alternatif_politika_uretim_s VARCHAR(50),
            alternatif_politika_mrp VARCHAR(50),
            ic_dis VARCHAR(10),
            ncbk_id UUID REFERENCES celik_hasir_netsis_ym_ncbk(id) ON DELETE CASCADE
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_ntel_recete') {
        // Çelik Hasır NTEL Reçete tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            mamul_kodu VARCHAR(255),
            recete_top NUMERIC(10,4) DEFAULT 1,
            fire_orani NUMERIC(10,6) DEFAULT 0,
            oto_rec VARCHAR(10),
            olcu_br VARCHAR(10),
            sira_no INT,
            operasyon_bilesen VARCHAR(50),
            bilesen_kodu VARCHAR(255),
            olcu_br_bilesen VARCHAR(10),
            miktar NUMERIC(15,6),
            aciklama TEXT,
            miktar_sabitle VARCHAR(10),
            stok_maliyet VARCHAR(10),
            fire_mik NUMERIC(15,6),
            sabit_fire_mik NUMERIC(15,6),
            istasyon_kodu VARCHAR(50),
            hazirlik_suresi NUMERIC(15,6),
            uretim_suresi NUMERIC(15,6),
            ua_dahil_edilsin VARCHAR(10),
            son_operasyon VARCHAR(10),
            oncelik INT,
            planlama_orani NUMERIC(10,4),
            alternatif_politika_da_transfer VARCHAR(50),
            alternatif_politika_ambar_c VARCHAR(50),
            alternatif_politika_uretim_s VARCHAR(50),
            alternatif_politika_mrp VARCHAR(50),
            ic_dis VARCHAR(10),
            ntel_id UUID REFERENCES celik_hasir_netsis_ym_ntel(id) ON DELETE CASCADE
          )
        `;
      } else if (tableName === 'celik_hasir_netsis_sequence') {
        // Çelik Hasır Sequence tablosu
        createTableQuery = `
          CREATE TABLE ${tableName} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            product_type VARCHAR(10),
            kod_2 VARCHAR(50),
            cap_code VARCHAR(10),
            last_sequence INT DEFAULT 0,
            UNIQUE(product_type, kod_2, cap_code)
          )
        `;
      } else {
        // Genel tablolar - tüm tablolarda TIMESTAMP WITH TIME ZONE kullanıyoruz
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
    } else {
      // Panel Çit tabloları için timestamp kontrolü yapıp timestamptz'ye güncelleme
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
          console.log(`⚠️ ${tableName} tablosunda timezone olmayan tarih alanları bulundu. Güncelleniyor...`);
          
          // Alter each column using a transaction
          await pool.query('BEGIN');
          try {
            for (const row of timestampColCheck.rows) {
              console.log(`🔄 ${row.column_name} alanı güncelleniyor...`);
              
              await pool.query(`
                ALTER TABLE ${tableName} 
                ALTER COLUMN ${row.column_name} TYPE TIMESTAMP WITH TIME ZONE
              `);
              
              console.log(`✅ ${row.column_name} alanı başarıyla güncellendi.`);
            }
            
            await pool.query('COMMIT');
            console.log(`✅ ${tableName} tablosundaki tüm tarih alanları TIMESTAMP WITH TIME ZONE tipine güncellendi.`);
          } catch (error) {
            await pool.query('ROLLBACK');
            console.error(`❌ ${tableName} tablosundaki tarih alanları güncellenirken hata oluştu:`, error);
          }
        }
      }
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
    console.log("Tüm tablolar kontrol edildi ve gerekirse oluşturuldu/güncellendi.");
  } catch (error) {
    console.error("Tablo kontrol hatası:", error);
  }
}

// Uygulama başlatıldığında tabloları kontrol et
checkAllTables();

// İlk çalıştırmada varsayılan hesaplama değerlerini ekle
async function insertDefaultUserInputValues() {
  try {
    // Eğer hiç kayıt yoksa varsayılan değerleri ekle
    const existingValues = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_user_input_values');
    
    if (parseInt(existingValues.rows[0].count) === 0) {
      console.log('Varsayılan hesaplama değerleri ekleniyor...');
      
      await pool.query(`
        INSERT INTO gal_cost_cal_user_input_values 
        (ash, lapa, uretim_kapasitesi_aylik, toplam_tuketilen_asit, ortalama_uretim_capi, paketlemeDkAdet)
        VALUES (5.54, 2.73, 2800, 30000, 3.08, 10)
      `);
      
      console.log('✅ Varsayılan hesaplama değerleri başarıyla eklendi');
    }
  } catch (error) {
    console.error('❌ Varsayılan hesaplama değerleri eklenirken hata:', error);
  }
}

// Tablolar oluşturulduktan sonra varsayılan değerleri ekle
setTimeout(insertDefaultUserInputValues, 5000);

// Veri Getirmek için Genel GET Rotası - İyileştirilmiş hata işleme ile
for (const table of tables) {
    app.get(`/api/${table}`, async (req, res) => {
        try {
            // URL'den sorgu parametrelerini al - ADD PAGINATION AND FILTERING SUPPORT
            const { id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, ids, status, created_by, request_id, 
                    limit, offset, page,
                    // Çelik Hasır specific filters
                    hasir_tipi, boy_cap, en_cap, uzunluk_boy, uzunluk_en, goz_araligi, stok_adi_like,
                    // Recipe table specific filter
                    mamul_kodu,
                    // New filter parameters for database screen
                    search, hasir_tipi_filter, hasir_turu_filter, sort_by, sort_order } = req.query;
            
            let query = `SELECT * FROM ${table}`;
            const queryParams = [];
            let whereConditions = [];
            
            // Sorgu parametrelerine göre WHERE koşullarını oluştur
            if (id) {
                const parsedId = typeof id === 'string' ? parseInt(id, 10) : id;
                whereConditions.push(`id = $${queryParams.length + 1}`);
                queryParams.push(parsedId);
            }
            
            if (mm_gt_id) {
                console.log(`🔍 Processing mm_gt_id parameter: "${mm_gt_id}" (type: ${typeof mm_gt_id})`);
                // Convert to integer if it's a string number
                const parsedId = typeof mm_gt_id === 'string' ? parseInt(mm_gt_id, 10) : mm_gt_id;
                console.log(`🔍 Parsed mm_gt_id: ${parsedId} (type: ${typeof parsedId})`);
                whereConditions.push(`mm_gt_id = $${queryParams.length + 1}`);
                queryParams.push(parsedId);
            }
            
            if (ym_gt_id) {
                const parsedYmGtId = typeof ym_gt_id === 'string' ? parseInt(ym_gt_id, 10) : ym_gt_id;
                whereConditions.push(`ym_gt_id = $${queryParams.length + 1}`);
                queryParams.push(parsedYmGtId);
            }
            
            if (ym_st_id) {
                const parsedYmStId = typeof ym_st_id === 'string' ? parseInt(ym_st_id, 10) : ym_st_id;
                whereConditions.push(`ym_st_id = $${queryParams.length + 1}`);
                queryParams.push(parsedYmStId);
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
            
            // Kullanıcı filtreleme
            if (created_by && table === 'gal_cost_cal_sal_requests') {
                whereConditions.push(`created_by = $${queryParams.length + 1}`);
                queryParams.push(created_by);
            }
            
            // Request ID filtreleme - MM GT, YM GT, YM ST tabloları için
            if (request_id && (table === 'gal_cost_cal_mm_gt' || table === 'gal_cost_cal_ym_gt' || table === 'gal_cost_cal_ym_st')) {
                whereConditions.push(`request_id = $${queryParams.length + 1}`);
                queryParams.push(request_id);
            }
            
            // Mamul kodu filtreleme - Recipe tabloları için (celik_hasir_netsis_mm_recete, ncbk_recete, ntel_recete)
            if (mamul_kodu && table && table.includes('_recete')) {
                whereConditions.push(`mamul_kodu = $${queryParams.length + 1}`);
                queryParams.push(mamul_kodu);
                console.log(`🔍 Filtering ${table} by mamul_kodu: ${mamul_kodu}`);
            }
            
            // REDIS CACHE CHECK - Before processing query for celik_hasir tables
            if (table.includes('celik_hasir')) {
                const filters = { hasir_tipi, boy_cap, en_cap, uzunluk_boy, uzunluk_en, goz_araligi, stok_adi_like, 
                                 id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, 
                                 ids, status, created_by, request_id, mamul_kodu };
                
                // Remove undefined values for cache key consistency
                const cleanFilters = Object.fromEntries(
                    Object.entries(filters).filter(([_, v]) => v != null && v !== undefined && v !== '')
                );
                
                const cacheKey = cacheHelpers.generateCacheKey(table, cleanFilters, page, limit);
                
                // Try to get from cache first
                const cachedData = await cacheHelpers.get(cacheKey);
                if (cachedData) {
                    // Return cached data with headers
                    res.setHeader('X-Total-Count', cachedData.totalRows);
                    res.setHeader('X-Cache', 'HIT');
                    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache for browsers
                    return res.json(cachedData.rows);
                }
            }
            
            // ÇELIK HASIR SPECIFIC FILTERS - Server-side filtering for performance
            if (table.includes('celik_hasir')) {
                if (hasir_tipi) {
                    whereConditions.push(`hasir_tipi = $${queryParams.length + 1}`);
                    queryParams.push(hasir_tipi);
                }
                
                if (boy_cap) {
                    const normalizedBoyCap = typeof boy_cap === 'string' && boy_cap.includes(',') 
                        ? parseFloat(boy_cap.replace(/,/g, '.')) 
                        : parseFloat(boy_cap);
                    whereConditions.push(`boy_cap = $${queryParams.length + 1}`);
                    queryParams.push(normalizedBoyCap);
                }
                
                if (en_cap) {
                    const normalizedEnCap = typeof en_cap === 'string' && en_cap.includes(',') 
                        ? parseFloat(en_cap.replace(/,/g, '.')) 
                        : parseFloat(en_cap);
                    whereConditions.push(`en_cap = $${queryParams.length + 1}`);
                    queryParams.push(normalizedEnCap);
                }
                
                if (uzunluk_boy) {
                    whereConditions.push(`uzunluk_boy = $${queryParams.length + 1}`);
                    queryParams.push(parseInt(uzunluk_boy));
                }
                
                if (uzunluk_en) {
                    whereConditions.push(`uzunluk_en = $${queryParams.length + 1}`);
                    queryParams.push(parseInt(uzunluk_en));
                }
                
                if (goz_araligi) {
                    whereConditions.push(`goz_araligi = $${queryParams.length + 1}`);
                    queryParams.push(goz_araligi);
                }
                
                if (stok_adi_like) {
                    whereConditions.push(`stok_adi ILIKE $${queryParams.length + 1}`);
                    queryParams.push(`%${stok_adi_like}%`);
                }
                
                // NEW: Global search filter (searches multiple columns)
                if (search) {
                    const searchConditions = [
                        `stok_kodu ILIKE $${queryParams.length + 1}`,
                        `stok_adi ILIKE $${queryParams.length + 1}`,
                        `grup_kodu ILIKE $${queryParams.length + 1}`,
                        `kod_1 ILIKE $${queryParams.length + 1}`,
                        `kod_2 ILIKE $${queryParams.length + 1}`
                    ];
                    whereConditions.push(`(${searchConditions.join(' OR ')})`);
                    queryParams.push(`%${search}%`);
                }
                
                // NEW: Hasır tipi filter for database screen
                if (hasir_tipi_filter && hasir_tipi_filter !== 'All') {
                    if (hasir_tipi_filter === 'Q Tipleri') {
                        whereConditions.push(`(stok_adi ILIKE $${queryParams.length + 1} OR hasir_tipi ILIKE $${queryParams.length + 1})`);
                        queryParams.push('%Q%');
                    } else if (hasir_tipi_filter === 'R Tipleri') {
                        // More specific R-type detection to avoid false matches
                        whereConditions.push(`(stok_adi ~* $${queryParams.length + 1} OR hasir_tipi ~* $${queryParams.length + 1})`);
                        queryParams.push('\\bR\\d+'); // R followed by digits
                    } else if (hasir_tipi_filter === 'TR Tipleri') {
                        whereConditions.push(`(stok_adi ILIKE $${queryParams.length + 1} OR hasir_tipi ILIKE $${queryParams.length + 1})`);
                        queryParams.push('%TR%');
                    }
                }
                
                // NEW: Hasır türü filter for database screen
                if (hasir_turu_filter && hasir_turu_filter !== 'All') {
                    if (hasir_turu_filter.toLowerCase() === 'standart') {
                        whereConditions.push(`kod_2 = $${queryParams.length + 1}`);
                        queryParams.push('STD');
                    } else {
                        whereConditions.push(`hasir_turu ILIKE $${queryParams.length + 1}`);
                        queryParams.push(hasir_turu_filter);
                    }
                }
            }
            
            // WHERE koşullarını ekle
            if (whereConditions.length > 0) {
                query += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            // Sıralama ekle
            if (sort_by && sort_order) {
                // Validate sort_by to prevent SQL injection
                const allowedSortColumns = ['id', 'stok_kodu', 'stok_adi', 'cap', 'created_at', 'hasir_tipi', 'kod_2'];
                if (allowedSortColumns.includes(sort_by)) {
                    const order = sort_order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
                    query += ` ORDER BY ${sort_by} ${order}`;
                }
            } else if (table === 'gal_cost_cal_sal_requests') {
                query += ` ORDER BY created_at DESC`;
            } else if (table.includes('celik_hasir')) {
                // Default ordering for celik_hasir tables
                query += ' ORDER BY id';
            }
            
            // PAGINATION SUPPORT - Only apply pagination when explicitly requested via limit parameter
            const pageSize = parseInt(limit) || null; // No default limit anymore
            const pageNumber = parseInt(page) || 1;
            const offsetValue = parseInt(offset) || ((pageNumber - 1) * (pageSize || 0));
            
            // Add pagination only when explicitly requested
            if (pageSize && pageSize > 0) {
                query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
                queryParams.push(pageSize, offsetValue);
                console.log(`📄 Pagination applied: LIMIT ${pageSize} OFFSET ${offsetValue}`);
            }
            
            console.log(`🔍 ${table} için sorgu:`, query);
            console.log("📝 Parametreler:", queryParams);
            
            // Get a client from the pool for better connection management
            const client = await pool.connect();
            
            try {
                // Set statement timeout for this specific query
                await client.query('SET statement_timeout = 60000'); // 60 seconds
                
                // Check if we need to count total rows (for large datasets)
                // Remove ORDER BY and LIMIT/OFFSET from count query
                let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
                countQuery = countQuery.replace(/ORDER BY.*$/i, '');
                countQuery = countQuery.replace(/LIMIT.*$/i, '');
                
                // Use original queryParams without pagination params for count
                const countParams = queryParams.slice(0, -2 * (pageSize ? 1 : 0));
                const countResult = await client.query(countQuery, countParams);
                const totalRows = parseInt(countResult.rows[0].total);
                
                console.log(`📊 ${table} total rows: ${totalRows}`);
                
                // Execute the main query
                const result = await client.query(query, queryParams);
                
                // REDIS CACHE STORE - Cache results for celik_hasir tables
                if (table.includes('celik_hasir') && result.rows.length > 0) {
                    const filters = { hasir_tipi, boy_cap, en_cap, uzunluk_boy, uzunluk_en, goz_araligi, stok_adi_like, 
                                     id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, 
                                     ids, status, created_by, request_id };
                    
                    const cleanFilters = Object.fromEntries(
                        Object.entries(filters).filter(([_, v]) => v != null && v !== undefined && v !== '')
                    );
                    
                    const cacheKey = cacheHelpers.generateCacheKey(table, cleanFilters, page, limit);
                    
                    // Store in cache with 5 minute TTL
                    await cacheHelpers.set(cacheKey, {
                        rows: result.rows,
                        totalRows: totalRows
                    }, 300);
                }
                
                // Add total count to response headers for frontend
                res.setHeader('X-Total-Count', totalRows);
                res.setHeader('X-Cache', 'MISS');
                res.setHeader('Cache-Control', table.includes('celik_hasir') ? 'public, max-age=300' : 'no-cache');
                
                // API tutarlılığı: Her zaman dizi döndür, boş sonuç için boş dizi
                res.json(result.rows);
            } finally {
                // Always release the client back to the pool
                client.release();
            }
        } catch (error) {
            console.error(`${table} tablosundan veri getirme hatası:`, error);
            
            // Better error handling for different error types
            if (error.code === '57014') {
                // Query timeout
                return res.status(504).json({ 
                    error: 'Query timeout - dataset too large',
                    suggestion: 'Try using filters to reduce the dataset size',
                    code: error.code
                });
            } else if (error.code === '53300') {
                // Too many connections
                return res.status(503).json({ 
                    error: 'Database connection limit reached',
                    suggestion: 'Please try again in a moment',
                    retry: true,
                    code: error.code
                });
            } else if (table.endsWith('_recete')) {
                // Reçete tabloları için 404 hatası durumunda boş bir dizi döndür
                console.log(`⚠️ ${table} tablosundan veri bulunamadı - boş dizi döndürülüyor`);
                return res.json([]);
            }
            
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

// Özel API: MMGT ve YMGT ID ile reçetelerin tam olup olmadığını kontrol eder
app.get('/api/check-recipes', async (req, res) => {
  try {
    const { mm_gt_id, ym_gt_id } = req.query;
    
    if (!mm_gt_id || !ym_gt_id) {
      return res.status(400).json({ error: 'mm_gt_id ve ym_gt_id zorunludur' });
    }
    
    // 1. MMGT reçetelerini kontrol et
    const mmGtRecipes = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [mm_gt_id]);
    
    // 2. YMGT reçetelerini kontrol et
    const ymGtRecipes = await pool.query('SELECT COUNT(*) FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ym_gt_id]);
    
    // MMGT ürününün kendisini bul (stok_kodu için)
    const mmGtProduct = await pool.query('SELECT stok_kodu FROM gal_cost_cal_mm_gt WHERE id = $1', [mm_gt_id]);
    
    // YMGT ürününün kendisini bul (stok_kodu için)
    const ymGtProduct = await pool.query('SELECT stok_kodu FROM gal_cost_cal_ym_gt WHERE id = $1', [ym_gt_id]);
    
    // İlişkiyi kontrol et
    const relation = await pool.query(`
      SELECT ym_st_id FROM gal_cost_cal_mm_gt_ym_st 
      WHERE mm_gt_id = $1 
      ORDER BY sira ASC LIMIT 1
    `, [mm_gt_id]);
    
    const mainYmStId = relation.rows.length > 0 ? relation.rows[0].ym_st_id : null;
    
    // YMST reçetelerini kontrol et
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
    console.error('Reçete kontrol hatası:', error);
    res.status(500).json({ 
      error: 'Reçeteler kontrol edilirken hata oluştu',
      details: error.message
    });
  }
});

// Veri Eklemek için Genel POST Rotası - İyileştirilmiş reçete ekleme desteği ile
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
                      
                      // Add notification for Galvaniz Talebi
                      if (table === 'gal_cost_cal_sal_requests' && result.rows[0]) {
                        try {
                          const notificationQuery = `
                            INSERT INTO crm_notifications (user_id, title, message, type, icon, action_link) 
                            VALUES ($1, $2, $3, $4, $5, $6)
                          `;
                          // Get username from session or use created_by field
                          const username = normalizedItem.created_by || normalizedItem.username || 'admin';
                          
                          await pool.query(notificationQuery, [
                            username,
                            'Yeni Galvaniz Talebi',
                            `${normalizedItem.firma_adi || 'Bilinmeyen'} firması için galvaniz talebi oluşturuldu`,
                            'info',
                            'Package',
                            `/satis/galvaniz-talebi/${result.rows[0].id}`
                          ]);
                          
                        } catch (notifError) {
                          console.log('Notification creation failed:', notifError);
                        }
                      }
                    } catch (itemError) {
                      console.error(`❌ Öğe ekleme hatası:`, itemError);
                      // Hata olduğunda diğer öğeleri etkilememek için devam et
                      results.push({ error: itemError.message, item });
                    }
                }
                
                if (results.length === 0) {
                  return res.status(400).json({ error: 'Hiçbir geçerli öğe eklenemedi' });
                }
                
                // REDIS CACHE INVALIDATION - Clear cache when batch data is added
                if (table.includes('celik_hasir') && results.length > 0) {
                  await cacheHelpers.clearTableCache(table);
                  console.log(`🗑️ Cache cleared for table: ${table} (batch insert)`);
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
                
                try {
                  const result = await pool.query(query, values);
                  
                  // Reçete ekleme ise özel log
                  if (table.endsWith('_recete')) {
                    console.log(`✅ Reçete başarıyla eklendi: ${table}, ID: ${result.rows[0].id}`);
                  }
                  
                  // Add notification for Galvaniz Talebi
                  if (table === 'gal_cost_cal_sal_requests' && result.rows[0]) {
                    try {
                      const notificationQuery = `
                        INSERT INTO crm_notifications (user_id, title, message, type, icon, action_link) 
                        VALUES ($1, $2, $3, $4, $5, $6)
                      `;
                      // Get username from session or use created_by field
                      const username = data.created_by || data.username || 'admin';
                      
                      await pool.query(notificationQuery, [
                        username,
                        'Yeni Galvaniz Talebi',
                        `${data.firma_adi || 'Bilinmeyen'} firması için galvaniz talebi oluşturuldu`,
                        'info',
                        'Package',
                        `/satis/galvaniz-talebi/${result.rows[0].id}`
                      ]);
                      
                      // Send email notification - wrapped in try-catch to not break the flow
                      try {
                        const https = require('https');
                        const emailData = JSON.stringify({
                          requestData: data,
                          requestId: result.rows[0].id
                        });
                        
                        const options = {
                          hostname: 'crm-deneme-backend.vercel.app',
                          path: '/api/send-galvaniz-notification',
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': emailData.length
                          }
                        };
                        
                        const emailReq = https.request(options, (res) => {
                          let data = '';
                          res.on('data', (chunk) => { data += chunk; });
                          res.on('end', () => {
                            if (res.statusCode === 200) {
                              console.log('✅ Email notification sent for request:', result.rows[0].id);
                            } else {
                              console.warn('⚠️ Email notification failed for request:', result.rows[0].id);
                            }
                          });
                        });
                        
                        emailReq.on('error', (error) => {
                          console.error('⚠️ Email request error:', error.message);
                        });
                        
                        emailReq.write(emailData);
                        emailReq.end();
                      } catch (emailError) {
                        console.error('⚠️ Email sending error (ignored):', emailError.message);
                      }
                    } catch (notifError) {
                      console.log('Notification creation failed:', notifError);
                    }
                  }
                  
                  // REDIS CACHE INVALIDATION - Clear cache when data is added
                  if (table.includes('celik_hasir')) {
                    await cacheHelpers.clearTableCache(table);
                    console.log(`🗑️ Cache cleared for table: ${table}`);
                  }
                  
                  res.status(201).json(result.rows[0]);
                } catch (insertError) {
                  // Reçete tabloları için özel hata işleme
                  if (table.endsWith('_recete')) {
                    console.error(`❌ Reçete eklenirken hata: ${insertError.message}`);
                    
                    // Kullanıcıya daha dostu bir hata mesajı döndür
                    if (insertError.code === '23502') {  // not-null constraint
                      return res.status(400).json({ 
                        error: 'Reçete için gerekli alanlar eksik',
                        details: insertError.detail || insertError.message 
                      });
                    } else if (insertError.code === '23505') {  // unique constraint
                      return res.status(409).json({
                        error: 'Bu reçete zaten mevcut',
                        details: insertError.detail || insertError.message
                      });
                    } else {
                      return res.status(500).json({
                        error: 'Reçete eklenirken bir hata oluştu',
                        details: insertError.message
                      });
                    }
                  }
                  
                  throw insertError; // Diğer tüm tablolar için normal hata işlemeye devam et
                }
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

// SPECIAL ENDPOINT: Get all IDs matching filters (for "Tümünü Seç" functionality)
for (const table of tables) {
    app.get(`/api/${table}/ids`, async (req, res) => {
        try {
            // Use same filtering logic but only return IDs
            const { hasir_tipi, boy_cap, en_cap, uzunluk_boy, uzunluk_en, goz_araligi, stok_adi_like } = req.query;
            
            let query = `SELECT id FROM ${table}`;
            const queryParams = [];
            let whereConditions = [];
            
            // Apply same filters as main GET endpoint
            if (table.includes('celik_hasir')) {
                if (hasir_tipi) {
                    whereConditions.push(`hasir_tipi = $${queryParams.length + 1}`);
                    queryParams.push(hasir_tipi);
                }
                
                if (boy_cap) {
                    const normalizedBoyCap = typeof boy_cap === 'string' && boy_cap.includes(',') 
                        ? parseFloat(boy_cap.replace(/,/g, '.')) 
                        : parseFloat(boy_cap);
                    whereConditions.push(`boy_cap = $${queryParams.length + 1}`);
                    queryParams.push(normalizedBoyCap);
                }
                
                if (en_cap) {
                    const normalizedEnCap = typeof en_cap === 'string' && en_cap.includes(',') 
                        ? parseFloat(en_cap.replace(/,/g, '.')) 
                        : parseFloat(en_cap);
                    whereConditions.push(`en_cap = $${queryParams.length + 1}`);
                    queryParams.push(normalizedEnCap);
                }
                
                if (uzunluk_boy) {
                    whereConditions.push(`uzunluk_boy = $${queryParams.length + 1}`);
                    queryParams.push(parseInt(uzunluk_boy));
                }
                
                if (uzunluk_en) {
                    whereConditions.push(`uzunluk_en = $${queryParams.length + 1}`);
                    queryParams.push(parseInt(uzunluk_en));
                }
                
                if (goz_araligi) {
                    whereConditions.push(`goz_araligi = $${queryParams.length + 1}`);
                    queryParams.push(goz_araligi);
                }
                
                if (stok_adi_like) {
                    whereConditions.push(`stok_adi ILIKE $${queryParams.length + 1}`);
                    queryParams.push(`%${stok_adi_like}%`);
                }
            }
            
            if (whereConditions.length > 0) {
                query += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            console.log(`🆔 Getting all IDs for ${table} with filters:`, req.query);
            
            const result = await pool.query(query, queryParams);
            const ids = result.rows.map(row => row.id);
            
            res.json({ ids, total: ids.length });
            
        } catch (error) {
            console.error(`Error getting IDs for ${table}:`, error);
            res.status(500).json({ error: `Failed to get IDs for ${table}` });
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
            let data = normalizeData(req.body);
            
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
        // Önce MM GT'nin stok_kodu'nu al
        const mmGtResult = await pool.query('SELECT stok_kodu FROM gal_cost_cal_mm_gt WHERE id = $1', [id]);
        if (mmGtResult.rows.length === 0) {
          console.log('⚠️ MM GT bulunamadı');
          return;
        }
        
        const mmGtStokKodu = mmGtResult.rows[0].stok_kodu;
        console.log(`🔍 MM GT Stok Kodu: ${mmGtStokKodu}`);
        
        // Eşleşen YM GT'yi bul (aynı sequence'e sahip)
        // MM GT: GT.X.0300.01 -> YM GT: YM.GT.X.0300.01
        const ymGtStokKodu = mmGtStokKodu.replace('GT.', 'YM.GT.');
        console.log(`🔍 Eşleşen YM GT Stok Kodu: ${ymGtStokKodu}`);
        
        const ymGtResult = await pool.query('SELECT id FROM gal_cost_cal_ym_gt WHERE stok_kodu = $1', [ymGtStokKodu]);
        console.log(`🔍 Bulunan YM GT sayısı: ${ymGtResult.rows.length}`);
        
        // Eğer YM GT bulunduysa, onun reçetelerini sil
        if (ymGtResult.rows.length > 0) {
          const ymGtId = ymGtResult.rows[0].id;
          
          try {
            const deletedYmGtRecipes = await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ymGtId]);
            console.log(`✅ YM GT reçeteleri silindi: ${deletedYmGtRecipes.rowCount}`);
          } catch (error) {
            console.log(`⚠️ YM GT reçetesi silinirken hata:`, error.message);
          }
          
          // YM GT kayıdını sil
          try {
            const deletedYmGt = await pool.query('DELETE FROM gal_cost_cal_ym_gt WHERE id = $1', [ymGtId]);
            console.log(`✅ YM GT kaydı silindi: ${deletedYmGt.rowCount}`);
          } catch (error) {
            console.log(`⚠️ YM GT kaydı silinirken hata:`, error.message);
          }
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
    
    // Çelik Hasır MM siliniyorsa, ilişkili reçeteleri sil
    if (table === 'celik_hasir_netsis_mm') {
      try {
        const deletedRecipes = await pool.query('DELETE FROM celik_hasir_netsis_mm_recete WHERE mm_id = $1', [id]);
        console.log(`✅ Çelik Hasır MM reçeteleri silindi: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Çelik Hasır MM reçeteleri silinirken hata:`, error.message);
      }
    }
    
    // Çelik Hasır NCBK siliniyorsa, ilişkili reçeteleri sil
    if (table === 'celik_hasir_netsis_ym_ncbk') {
      try {
        const deletedRecipes = await pool.query('DELETE FROM celik_hasir_netsis_ncbk_recete WHERE ncbk_id = $1', [id]);
        console.log(`✅ Çelik Hasır NCBK reçeteleri silindi: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Çelik Hasır NCBK reçeteleri silinirken hata:`, error.message);
      }
    }
    
    // Çelik Hasır NTEL siliniyorsa, ilişkili reçeteleri sil
    if (table === 'celik_hasir_netsis_ym_ntel') {
      try {
        const deletedRecipes = await pool.query('DELETE FROM celik_hasir_netsis_ntel_recete WHERE ntel_id = $1', [id]);
        console.log(`✅ Çelik Hasır NTEL reçeteleri silindi: ${deletedRecipes.rowCount}`);
      } catch (error) {
        console.log(`⚠️ Çelik Hasır NTEL reçeteleri silinirken hata:`, error.message);
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

// BULK DELETION ENDPOINTS FOR OPTIMIZED PERFORMANCE
// These endpoints provide efficient bulk deletion by stok_kodu/mamul_kodu
// They are designed to replace the slow individual deletion pattern

// Bulk delete recipes by mamul_kodu (for all recipe tables)
app.delete('/api/celik_hasir_netsis_mm_recete/bulk-delete-by-mamul', async (req, res) => {
  const client = await pool.connect();
  try {
    const { mamul_kodu } = req.query;
    if (!mamul_kodu) {
      return res.status(400).json({ error: 'mamul_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting MM recipes for mamul_kodu: ${mamul_kodu}`);

    const result = await client.query(
      'DELETE FROM celik_hasir_netsis_mm_recete WHERE mamul_kodu = $1',
      [mamul_kodu]
    );

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_mm_recete');
    
    console.log(`✅ Bulk deleted ${result.rowCount} MM recipes for mamul_kodu: ${mamul_kodu}`);
    res.json({ 
      message: `Successfully deleted ${result.rowCount} recipes`,
      deletedCount: result.rowCount,
      mamul_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk MM recipe deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ncbk_recete/bulk-delete-by-mamul', async (req, res) => {
  const client = await pool.connect();
  try {
    const { mamul_kodu } = req.query;
    if (!mamul_kodu) {
      return res.status(400).json({ error: 'mamul_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting NCBK recipes for mamul_kodu: ${mamul_kodu}`);

    const result = await client.query(
      'DELETE FROM celik_hasir_netsis_ncbk_recete WHERE mamul_kodu = $1',
      [mamul_kodu]
    );

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ncbk_recete');
    
    console.log(`✅ Bulk deleted ${result.rowCount} NCBK recipes for mamul_kodu: ${mamul_kodu}`);
    res.json({ 
      message: `Successfully deleted ${result.rowCount} recipes`,
      deletedCount: result.rowCount,
      mamul_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk NCBK recipe deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ntel_recete/bulk-delete-by-mamul', async (req, res) => {
  const client = await pool.connect();
  try {
    const { mamul_kodu } = req.query;
    if (!mamul_kodu) {
      return res.status(400).json({ error: 'mamul_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting NTEL recipes for mamul_kodu: ${mamul_kodu}`);

    const result = await client.query(
      'DELETE FROM celik_hasir_netsis_ntel_recete WHERE mamul_kodu = $1',
      [mamul_kodu]
    );

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ntel_recete');
    
    console.log(`✅ Bulk deleted ${result.rowCount} NTEL recipes for mamul_kodu: ${mamul_kodu}`);
    res.json({ 
      message: `Successfully deleted ${result.rowCount} recipes`,
      deletedCount: result.rowCount,
      mamul_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk NTEL recipe deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Bulk delete products by stok_kodu (for all product tables)
app.delete('/api/celik_hasir_netsis_mm/bulk-delete-by-stok', async (req, res) => {
  const client = await pool.connect();
  try {
    const { stok_kodu } = req.query;
    if (!stok_kodu) {
      return res.status(400).json({ error: 'stok_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting MM products for stok_kodu: ${stok_kodu}`);

    // First delete related recipes
    const recipeResult = await client.query(
      'DELETE FROM celik_hasir_netsis_mm_recete WHERE mamul_kodu = $1',
      [stok_kodu]
    );

    // Then delete the product
    const productResult = await client.query(
      'DELETE FROM celik_hasir_netsis_mm WHERE stok_kodu = $1',
      [stok_kodu]
    );

    // Update sequence table after deletion if this is an OZL product
    if (stok_kodu.startsWith('CHOZL')) {
      try {
        // Extract sequence number from stok_kodu (e.g., CHOZL2450 -> 2450)
        const sequenceMatch = stok_kodu.match(/CHOZL(\d+)/);
        if (sequenceMatch) {
          // Find the highest remaining sequence number for OZL products
          const maxSeqResult = await client.query(`
            SELECT COALESCE(MAX(CAST(SUBSTRING(stok_kodu FROM 'CHOZL(\\d+)') AS INTEGER)), 0) as max_seq
            FROM celik_hasir_netsis_mm 
            WHERE stok_kodu ~ '^CHOZL\\d+$'
          `);
          
          const newMaxSeq = maxSeqResult.rows[0].max_seq;
          
          // Update both OZL and OZL_BACKUP sequences
          await client.query(`
            UPDATE celik_hasir_netsis_sequence 
            SET last_sequence = $1, updated_at = NOW()
            WHERE product_type = 'CH' AND kod_2 IN ('OZL', 'OZL_BACKUP')
          `, [newMaxSeq]);
          
          console.log(`📊 Updated OZL sequence to ${newMaxSeq} after deleting ${stok_kodu}`);
        }
      } catch (seqError) {
        console.error('❌ Sequence update error (non-critical):', seqError.message);
        // Don't fail the deletion if sequence update fails
      }
    }

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_mm');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_mm_recete');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_sequence');
    
    console.log(`✅ Bulk deleted MM: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes for stok_kodu: ${stok_kodu}`);
    res.json({ 
      message: `Successfully deleted ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount,
      stok_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk MM product deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ym_ncbk/bulk-delete-by-stok', async (req, res) => {
  const client = await pool.connect();
  try {
    const { stok_kodu } = req.query;
    if (!stok_kodu) {
      return res.status(400).json({ error: 'stok_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting NCBK products for stok_kodu: ${stok_kodu}`);

    // First delete related recipes
    const recipeResult = await client.query(
      'DELETE FROM celik_hasir_netsis_ncbk_recete WHERE mamul_kodu = $1',
      [stok_kodu]
    );

    // Then delete the product
    const productResult = await client.query(
      'DELETE FROM celik_hasir_netsis_ym_ncbk WHERE stok_kodu = $1',
      [stok_kodu]
    );

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ym_ncbk');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ncbk_recete');
    
    console.log(`✅ Bulk deleted NCBK: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes for stok_kodu: ${stok_kodu}`);
    res.json({ 
      message: `Successfully deleted ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount,
      stok_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk NCBK product deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ym_ntel/bulk-delete-by-stok', async (req, res) => {
  const client = await pool.connect();
  try {
    const { stok_kodu } = req.query;
    if (!stok_kodu) {
      return res.status(400).json({ error: 'stok_kodu parameter is required' });
    }

    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting NTEL products for stok_kodu: ${stok_kodu}`);

    // First delete related recipes
    const recipeResult = await client.query(
      'DELETE FROM celik_hasir_netsis_ntel_recete WHERE mamul_kodu = $1',
      [stok_kodu]
    );

    // Then delete the product
    const productResult = await client.query(
      'DELETE FROM celik_hasir_netsis_ym_ntel WHERE stok_kodu = $1',
      [stok_kodu]
    );

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ym_ntel');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ntel_recete');
    
    console.log(`✅ Bulk deleted NTEL: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes for stok_kodu: ${stok_kodu}`);
    res.json({ 
      message: `Successfully deleted ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount,
      stok_kodu 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk NTEL product deletion error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Bulk delete all products and recipes for a specific type
app.delete('/api/celik_hasir_netsis_mm/bulk-delete-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting ALL MM products and recipes`);

    // First delete all recipes
    const recipeResult = await client.query('DELETE FROM celik_hasir_netsis_mm_recete');

    // Then delete all products
    const productResult = await client.query('DELETE FROM celik_hasir_netsis_mm');

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_mm');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_mm_recete');
    
    console.log(`✅ Bulk deleted ALL MM: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes`);
    res.json({ 
      message: `Successfully deleted all MM data: ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk delete all MM error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ym_ncbk/bulk-delete-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting ALL NCBK products and recipes`);

    // First delete all recipes
    const recipeResult = await client.query('DELETE FROM celik_hasir_netsis_ncbk_recete');

    // Then delete all products
    const productResult = await client.query('DELETE FROM celik_hasir_netsis_ym_ncbk');

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ym_ncbk');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ncbk_recete');
    
    console.log(`✅ Bulk deleted ALL NCBK: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes`);
    res.json({ 
      message: `Successfully deleted all NCBK data: ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk delete all NCBK error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/celik_hasir_netsis_ym_ntel/bulk-delete-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`🗑️ Bulk deleting ALL NTEL products and recipes`);

    // First delete all recipes
    const recipeResult = await client.query('DELETE FROM celik_hasir_netsis_ntel_recete');

    // Then delete all products
    const productResult = await client.query('DELETE FROM celik_hasir_netsis_ym_ntel');

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ym_ntel');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_ntel_recete');
    
    console.log(`✅ Bulk deleted ALL NTEL: ${productResult.rowCount} products, ${recipeResult.rowCount} recipes`);
    res.json({ 
      message: `Successfully deleted all NTEL data: ${productResult.rowCount} products and ${recipeResult.rowCount} recipes`,
      deletedProducts: productResult.rowCount,
      deletedRecipes: recipeResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk delete all NTEL error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

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
            
            // REDIS CACHE INVALIDATION - Clear cache when data is deleted
            if (table.includes('celik_hasir')) {
              await cacheHelpers.clearTableCache(table);
              console.log(`🗑️ Cache cleared for table: ${table} (delete operation)`);
            }
            
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

// Veritabanı şeması hakkında bilgi almak için özel endpoint
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

// Tüm timestamp alanlarını timestamptz'ye çeviren admin endpoint'i
app.post('/api/admin/update-timestamp-columns', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Büyütülenecek tablolar (sadece belirtilen tablolar değil, veritabanındaki tüm tablolar)
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name LIKE 'panel_cost_cal_%'
    `);
    
    const panelCitTables = tablesResult.rows.map(row => row.table_name);
    const results = {};
    
    for (const table of panelCitTables) {
      // Tablodaki timestamp sütunlarını kontrol et
      const columnsResult = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND data_type = 'timestamp without time zone'
      `, [table]);
      
      const timestampColumns = columnsResult.rows.map(row => row.column_name);
      results[table] = {
        columns_fixed: timestampColumns,
        success: true
      };
      
      // timestamp sütunlarını timestamptz'ye çevir
      for (const column of timestampColumns) {
        try {
          await client.query(`
            ALTER TABLE ${table} 
            ALTER COLUMN ${column} TYPE TIMESTAMP WITH TIME ZONE
          `);
          console.log(`✅ ${table}.${column} başarıyla TIMESTAMP WITH TIME ZONE tipine güncellendi.`);
        } catch (columnError) {
          results[table].success = false;
          results[table].error = columnError.message;
          console.error(`❌ ${table}.${column} güncellenirken hata:`, columnError.message);
        }
      }
    }
    
    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Panel Cost Cal tablolarının timestamp alanları güncellendi',
      details: results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Timestamp alanlarını güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    client.release();
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
    
    // Formatı kontrol et - 5 decimal places
    const formattedCap = parseFloat(normalizedCap).toFixed(5).replace('.', '').padStart(7, '0');
    
    // Bu kombinasyon için en yüksek sıra numarasını bul
    const result = await pool.query(`
      SELECT MAX(CAST(SUBSTRING(stok_kodu FROM 10 FOR 2) AS INTEGER)) as max_seq
      FROM gal_cost_cal_mm_gt
      WHERE kod_2 = $1 AND stok_kodu LIKE $2
    `, [kod_2, `GT.${kod_2}.${formattedCap}.%`]);
    
    let nextSeq = 0;
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

// TLC Hizlar verilerini eklemek için yardımcı endpoint
app.post('/api/bulk-import/tlc-hizlar', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const data = req.body;
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Geçersiz veri formatı. Veri dizi tipinde olmalıdır.' });
    }
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'Boş veri listesi gönderilemez.' });
    }
    
    console.log(`📥 TLC Hızlar verisi eklenecek: ${data.length} adet kayıt`);
    
    await client.query('BEGIN');
    
    // Önce tüm mevcut verileri temizleyelim (opsiyonel, güvenli bir silme istiyorsanız)
    const clearResult = await client.query('DELETE FROM gal_cost_cal_user_tlc_hizlar');
    console.log(`🧹 Mevcut TLC Hızlar tablosu temizlendi: ${clearResult.rowCount} kayıt silindi`);
    
    // Başarılı ve başarısız sayısını izleyen değişkenler
    let successCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // Her bir veriyi ekle
    for (const item of data) {
      try {
        // Sayısal değerleri normalize et
        const normalizedItem = normalizeData(item);
        
        // giris_capi, cikis_capi ve calisma_hizi zorunlu alanlar
        if (!normalizedItem.giris_capi || !normalizedItem.cikis_capi || !normalizedItem.calisma_hizi) {
          throw new Error('Zorunlu alanlar eksik: giris_capi, cikis_capi, calisma_hizi');
        }
        
        // kod alanı için giris_capi x cikis_capi formatı oluştur
        const kod = `${normalizedItem.giris_capi}x${normalizedItem.cikis_capi}`;
        
        const insertQuery = `
          INSERT INTO gal_cost_cal_user_tlc_hizlar (
            giris_capi, cikis_capi, kod, total_red, kafa_sayisi, 
            calisma_hizi, uretim_kg_saat, elektrik_sarfiyat_kw_sa, elektrik_sarfiyat_kw_ton
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;
        
        const values = [
          normalizedItem.giris_capi,
          normalizedItem.cikis_capi,
          kod,
          normalizedItem.total_red || null,
          normalizedItem.kafa_sayisi || null,
          normalizedItem.calisma_hizi,
          normalizedItem.uretim_kg_saat || null,
          normalizedItem.elektrik_sarfiyat_kw_sa || null,
          normalizedItem.elektrik_sarfiyat_kw_ton || null
        ];
        
        const result = await client.query(insertQuery, values);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({
          item,
          error: error.message
        });
        console.error(`❌ TLC Hızlar verisi eklenirken hata:`, error.message);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ TLC Hızlar verisi eklendi: ${successCount} başarılı, ${errorCount} başarısız`);
    
    res.status(201).json({
      success: true,
      message: `TLC Hızlar verileri başarıyla içe aktarıldı.`,
      details: {
        success_count: successCount,
        error_count: errorCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ TLC Hızlar toplu veri ekleme hatası:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ISOLATED EMAIL ENDPOINT - Galvanizli Tel Request Notification
// This endpoint is completely isolated to prevent any issues with the rest of the backend
app.post('/api/send-galvaniz-notification', async (req, res) => {
  console.log('📧 Galvaniz talep bildirimi gönderme isteği alındı');
  
  // Always return success to prevent breaking the main flow
  try {
    const { requestData, requestId } = req.body;
    console.log('📧 Request data received:', { requestId, hasRequestData: !!requestData });
    
    
    // RESEND IMPLEMENTATION (Active)
    // Check if Resend API key exists
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not found in environment variables');
      throw new Error('Resend API key not configured');
    }
    
    // Use direct HTTPS request to Resend API
    const https = require('https');
    
    // Format the request data for email with professional design
    const formattedData = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); padding: 40px 30px; text-align: center; border-bottom: 4px solid #dc3545;">
          <!-- Logo with multiple possible extensions -->
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHRbZuBJGKNr0tNqoahRylJW_ybbltProcCw&s" 
               alt="ALBAYRAK DEMİR ÇELİK" 
               style="max-height: 100px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;">
          <h1 style="color: #1a1a1a; margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 1px;">ALBAYRAK DEMİR ÇELİK</h1>
          <p style="color: #666; margin: 8px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">CRM SİSTEMİ</p>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 40px 30px;">
          <!-- Title Section -->
          <div style="margin-bottom: 35px;">
            <h2 style="color: #dc3545; font-size: 24px; font-weight: 400; margin: 0; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
              Yeni Galvanizli Tel Talebi
            </h2>
          </div>
          
          <!-- Request Info -->
          <div style="background-color: #fafafa; padding: 20px; border-left: 4px solid #dc3545; margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 140px;">Talep Numarası:</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600; font-size: 14px;">${requestId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Talep Tarihi:</td>
                <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px;">${new Date().toLocaleString('tr-TR')}</td>
              </tr>
            </table>
          </div>
          
          <!-- Product Details -->
          <div style="margin-bottom: 30px;">
            <h3 style="color: #333; font-size: 18px; font-weight: 500; margin: 0 0 20px 0; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
              Ürün Detayları
            </h3>
            
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333; width: 40%;">Çap</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #dc3545; font-weight: 600;">${requestData?.cap || 'N/A'} mm</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Kod-2</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">${requestData?.kod_2 || 'N/A'}</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Kaplama</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">${requestData?.kaplama || 'N/A'} g/m²</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Mukavemet Aralığı</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">${requestData?.min_mukavemet || 'N/A'} - ${requestData?.max_mukavemet || 'N/A'} MPa</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Ağırlık</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #dc3545; font-weight: 600;">${requestData?.kg || 'N/A'} kg</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Çap Ölçüleri</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">İç: ${requestData?.ic_cap || 'N/A'} cm / Dış: ${requestData?.dis_cap || 'N/A'} cm</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Tolerans</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">+${requestData?.tolerans_plus || 'N/A'} / -${requestData?.tolerans_minus || 'N/A'} mm</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; font-weight: 500; color: #333;">Shrink</td>
                <td style="background-color: #fff; border-bottom: 1px solid #e0e0e0; padding: 14px 20px; color: #1a1a1a;">${requestData?.shrink === 'evet' ? 'Evet' : 'Hayır'}</td>
              </tr>
              <tr>
                <td style="background-color: #f8f9fa; padding: 14px 20px; font-weight: 500; color: #333;">Unwinding</td>
                <td style="background-color: #fff; padding: 14px 20px; color: #1a1a1a;">${requestData?.unwinding || 'N/A'}</td>
              </tr>
            </table>
          </div>
          
          <!-- Action Section -->
          <div style="background-color: #f0f8ff; border: 1px solid #d1e7f5; padding: 25px; text-align: center; border-radius: 8px; margin-top: 35px;">
            <p style="margin: 0; color: #0066cc; font-size: 16px; font-weight: 500;">
              Bu talep üretim departmanına iletilmiştir
            </p>
            <p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">
              Lütfen en kısa sürede değerlendirme yapınız
            </p>
            <div style="margin-top: 20px;">
              <a href="https://crm-deneme-1.vercel.app/" 
                 style="display: inline-block; background-color: #dc3545; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: 500; font-size: 14px;">
                CRM Sistemine Git
              </a>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 25px 30px; border-top: 1px solid #e0e0e0; text-align: center;">
          <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.6;">
            Bu e-posta ALB CRM sistemi tarafından otomatik olarak gönderilmiştir.<br>
            Lütfen bu e-postaya cevap vermeyiniz.
          </p>
        </div>
      </div>
    `;
    
    
    // ===== RESEND IMPLEMENTATION (ACTIVE) =====
    // Prepare email data for Resend API
    const emailData = {
      from: 'ALB CRM System <onboarding@resend.dev>', // Using Resend's test domain
      to: ['albcrm01@gmail.com'], // Your email
      reply_to: 'hakannoob@gmail.com', // Production team can reply here
      subject: `Yeni Galvanizli Tel Talebi - ${requestId || new Date().getTime()}`,
      html: formattedData + `
        <hr style="margin-top: 30px;">
        <p style="color: #666; font-size: 12px;">
          Bu email ALB CRM sistemi tarafından otomatik olarak gönderilmiştir.<br>
          Üretim ekibi için: hakannoob@gmail.com<br>
          <strong>Not:</strong> Domain doğrulaması yapılana kadar test modunda çalışmaktadır.
        </p>
      `
    };
    
    // Make direct API call to Resend
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    
    // Create promise for the API call
    const sendEmail = new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode === 200 || response.statusCode === 201) {
            console.log('✅ Email başarıyla gönderildi via Resend');
            resolve(JSON.parse(data));
          } else {
            console.error('❌ Resend API error:', response.statusCode, data);
            reject(new Error(`Resend API error: ${response.statusCode} - ${data}`));
          }
        });
      });
      
      request.on('error', (error) => {
        console.error('❌ Request error:', error);
        reject(error);
      });
      
      // Send the request
      request.write(JSON.stringify(emailData));
      request.end();
    });
    
    // Wait for email to be sent
    await sendEmail;
    
    res.status(200).json({ 
      success: true, 
      emailSent: true,
      message: 'Bildirim emaili gönderildi'
    });
    
  } catch (error) {
    // Log error but don't break the main flow
    console.error('⚠️ Email gönderme hatası (ignored):', error.message);
    
    // Still return success to not break the request creation
    res.status(200).json({ 
      success: true, 
      emailSent: false,
      message: 'Talep oluşturuldu ancak email gönderilemedi',
      error: error.message // Include error for debugging
    });
  }
});

// Import new API endpoints
const crmEndpoints = require('./api-endpoints');
app.locals.pool = pool; // Make pool available to endpoints
app.use(crmEndpoints);

// Yerel geliştirme için Sunucu Başlatma
// Add dedicated export endpoint for large datasets
app.get('/api/export/:table', async (req, res) => {
    const { table } = req.params;
    const client = await pool.connect();
    
    try {
        // Set longer timeout for export operations
        await client.query('SET statement_timeout = 120000'); // 2 minutes
        
        // Build query with filters if provided
        let query = `SELECT * FROM ${table}`;
        const queryParams = [];
        const whereConditions = [];
        
        // Add any filters from query parameters
        const { ids, hasir_tipi, stok_kodu_like } = req.query;
        
        if (ids) {
            const idList = ids.split(',');
            whereConditions.push(`id IN (${idList.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`);
            idList.forEach(id => queryParams.push(id));
        }
        
        if (hasir_tipi) {
            whereConditions.push(`hasir_tipi = $${queryParams.length + 1}`);
            queryParams.push(hasir_tipi);
        }
        
        if (stok_kodu_like) {
            whereConditions.push(`stok_kodu LIKE $${queryParams.length + 1}`);
            queryParams.push(`${stok_kodu_like}%`);
        }
        
        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        
        query += ' ORDER BY id';
        
        console.log(`📤 Export query for ${table}:`, query);
        
        const result = await client.query(query, queryParams);
        
        // Return data optimized for Excel export
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Total-Count', result.rows.length);
        res.json({
            data: result.rows,
            count: result.rows.length,
            table: table
        });
        
    } catch (error) {
        console.error(`Export error for ${table}:`, error);
        
        if (error.code === '57014') {
            res.status(504).json({ 
                error: 'Export timeout - dataset too large',
                suggestion: 'Try exporting with filters to reduce size'
            });
        } else {
            res.status(500).json({ 
                error: 'Export failed',
                details: error.message
            });
        }
    } finally {
        client.release();
    }
});

// CH Sequence reset endpoint
app.post('/api/celik_hasir_netsis_sequence/reset-ch-sequences', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log(`🔄 Resetting CH sequences`);

    // Reset OZL and OZL_BACKUP sequences to 0
    const ozlResult = await client.query(`
      UPDATE celik_hasir_netsis_sequence 
      SET sequence = 0, updated_at = NOW()
      WHERE product_type = 'CH' AND kod_2 = 'OZL'
    `);

    const ozlBackupResult = await client.query(`
      UPDATE celik_hasir_netsis_sequence 
      SET sequence = 0, updated_at = NOW()
      WHERE product_type = 'CH' AND kod_2 = 'OZL_BACKUP'
    `);

    await client.query('COMMIT');
    await cacheHelpers.clearTableCache('celik_hasir_netsis_sequence');
    
    console.log(`✅ Reset CH sequences: OZL=${ozlResult.rowCount}, OZL_BACKUP=${ozlBackupResult.rowCount}`);
    res.json({ 
      message: `Successfully reset CH sequences`,
      ozl_updated: ozlResult.rowCount,
      ozl_backup_updated: ozlBackupResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ CH sequence reset error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Add health check endpoint for monitoring
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'healthy',
            timestamp: result.rows[0].now,
            poolStats: {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Backend ${PORT} portunda çalışıyor`);
    });
}

// Vercel için dışa aktar
module.exports = app;
