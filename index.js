// COMPLETE FIXED VERSION OF INDEX.JS WITH TIMESTAMP ISSUE RESOLVED
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
    'gal_cost_cal_user_tlc_hizlar' // TLC Hızlar tablosu için
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
            
            // Reçete tabloları için 404 hatası durumunda boş bir dizi döndür
            if (table.endsWith('_recete')) {
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
                
                try {
                  const result = await pool.query(query, values);
                  
                  // Reçete ekleme ise özel log
                  if (table.endsWith('_recete')) {
                    console.log(`✅ Reçete başarıyla eklendi: ${table}, ID: ${result.rows[0].id}`);
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

// Yerel geliştirme için Sunucu Başlatma
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Backend ${PORT} portunda çalışıyor`);
    });
}

// Vercel için dışa aktar
module.exports = app;
