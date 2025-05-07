require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors({
  origin: '*',  // Geliştirme için - üretime geçerken bu kısıtlanmalıdır
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// PostgreSQL Bağlantısı
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Sayı formatını düzenleyen yardımcı fonksiyon
// Virgül yerine nokta kullanarak sayı formatını düzenler
const normalizeNumber = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    // Virgülleri noktalara çevir - global flag ile tüm virgülleri değiştir
    // Önceki kod sadece ilk virgülü değiştiriyordu
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

// Verileri işleyen yardımcı fonksiyon - virgüllü sayıları noktalı formata dönüştürür
const normalizeData = (data) => {
  if (Array.isArray(data)) {
    return data.map(item => normalizeData(item));
  }
  
  if (data && typeof data === 'object') {
    const normalizedData = {};
    
    for (const [key, value] of Object.entries(data)) {
      normalizedData[key] = normalizeNumber(value);
    }
    
    return normalizedData;
  }
  
  return normalizeNumber(data);
};

// Test Rotası
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ message: "Veritabanı Bağlandı!", timestamp: result.rows[0].now });
    } catch (error) {
        console.error("Veritabanı Bağlantı Hatası:", error);
        res.status(500).json({ error: error.message });
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
    'gal_cost_cal_sequence'
];

// Veri Getirmek için Genel GET Rotası
for (const table of tables) {
    app.get(`/api/${table}`, async (req, res) => {
        try {
            // URL'den sorgu parametrelerini al
            const { id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, ids } = req.query;
            
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
            
            // Çoklu ID araması için
            if (ids) {
                const idList = ids.split(',');
                whereConditions.push(`id IN (${idList.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`);
                idList.forEach(id => queryParams.push(id));
            }
            
            // WHERE koşullarını ekle
            if (whereConditions.length > 0) {
                query += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            console.log(`🔍 ${table} için sorgu:`, query);
            console.log("📝 Parametreler:", queryParams);
            
            const result = await pool.query(query, queryParams);
            
            // API tutarlılığı: Her zaman dizi döndür, boş sonuç için boş dizi
            res.json(result.rows);
        } catch (error) {
            console.error(`${table} tablosundan veri getirme hatası:`, error);
            res.status(500).json({ error: error.message });
        }
    });
}

// Veri Eklemek için Genel POST Rotası
for (const table of tables) {
    app.post(`/api/${table}`, async (req, res) => {
        try {
            let data = req.body;
            
            // Gelen veri bir dizi mi kontrol et
            if (Array.isArray(data)) {
                console.log(`📥 ${table} tablosuna dizi veri ekleniyor (${data.length} öğe)`);
                
                // Her bir öğeyi ayrı ayrı işle
                const results = [];
                
                for (const item of data) {
                    // Sayı değerlerini normalize et (virgülleri noktalara çevir)
                    const normalizedItem = normalizeData(item);
                    
                    const columns = Object.keys(normalizedItem).join(', ');
                    const placeholders = Object.keys(normalizedItem).map((_, index) => `$${index + 1}`).join(', ');
                    const values = Object.values(normalizedItem);
                    
                    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                    
                    console.log(`📥 Ekleniyor: ${table} (dizi öğesi)`);
                    console.log("🧾 Sütunlar:", columns);
                    console.log("📎 Değerler:", values);
                    
                    const result = await pool.query(query, values);
                    results.push(result.rows[0]);
                }
                
                res.status(201).json(results);
            } else {
                // Sayı değerlerini normalize et (virgülleri noktalara çevir)
                data = normalizeData(data);
                
                const columns = Object.keys(data).join(', ');
                const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
                const values = Object.values(data);
                
                const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                
                console.log(`📥 Ekleniyor: ${table}`);
                console.log("🧾 Sütunlar:", columns);
                console.log("📎 Değerler:", values);
                
                const result = await pool.query(query, values);
                res.status(201).json(result.rows[0]);
            }
        } catch (error) {
            console.error(`❌ '${table}' tablosuna ekleme başarısız:`, error);
            console.error("🧾 Veri:", req.body);
            res.status(500).json({ 
                error: error.message,
                stack: error.stack,
            });
        }
    });
}

// Veri Güncellemek için Genel PUT Rotası
for (const table of tables) {
    app.put(`/api/${table}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            
            // Sayı değerlerini normalize et (virgülleri noktalara çevir)
            const data = normalizeData(req.body);
            
            const updates = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
            const values = Object.values(data);
            
            const query = `UPDATE ${table} SET ${updates} WHERE id = $${values.length + 1} RETURNING *`;
            values.push(id);
            
            console.log(`🔄 Güncelleniyor: ${table}`);
            console.log("🧾 Güncellemeler:", updates);
            console.log("📎 Değerler:", values);
            
            const result = await pool.query(query, values);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Kayıt bulunamadı" });
            }
            
            // Tutarlı API yanıtı - her zaman tek bir nesne döndür
            res.json(result.rows[0]);
        } catch (error) {
            console.error(`${table} tablosunda veri güncelleme hatası:`, error);
            res.status(500).json({ error: error.message });
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

// İlişkili Kayıtları Silme Yardımcı Fonksiyonu
async function deleteRelatedRecords(table, id) {
  try {
    // MM GT siliniyorsa, ilgili YM GT ve ilişkili reçeteleri sil
    if (table === 'gal_cost_cal_mm_gt') {
      // İlişkili YM GT kayıtlarını bul
      const ymGtResult = await pool.query('SELECT id FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
      
      // Her bir YM GT için ilişkili reçeteleri sil
      for (const ymGt of ymGtResult.rows) {
        await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [ymGt.id]);
      }
      
      // YM GT kayıtlarını sil
      await pool.query('DELETE FROM gal_cost_cal_ym_gt WHERE mm_gt_id = $1', [id]);
      
      // MM GT-YM ST ilişkilerini sil
      await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE mm_gt_id = $1', [id]);
      
      // MM GT reçetelerini sil
      await pool.query('DELETE FROM gal_cost_cal_mm_gt_recete WHERE mm_gt_id = $1', [id]);
    }
    
    // YM GT siliniyorsa, ilişkili reçeteleri sil
    if (table === 'gal_cost_cal_ym_gt') {
      await pool.query('DELETE FROM gal_cost_cal_ym_gt_recete WHERE ym_gt_id = $1', [id]);
    }
    
    // YM ST siliniyorsa, ilişkili MM GT-YM ST ilişkilerini ve reçeteleri sil
    if (table === 'gal_cost_cal_ym_st') {
      await pool.query('DELETE FROM gal_cost_cal_mm_gt_ym_st WHERE ym_st_id = $1', [id]);
      await pool.query('DELETE FROM gal_cost_cal_ym_st_recete WHERE ym_st_id = $1', [id]);
    }
    
    return true;
  } catch (error) {
    console.error(`İlişkili kayıtları silme hatası (${table}, ${id}):`, error);
    throw error;
  }
}

// Veri Silmek için Genel DELETE Rotası (kademeli silme destekli)
for (const table of tables) {
    app.delete(`/api/${table}/:id`, async (req, res) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { id } = req.params;
            
            // İlişkili kayıtları sil
            await deleteRelatedRecords(table, id);
            
            // Ana kaydı sil
            const query = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: "Kayıt bulunamadı" });
            }
            
            await client.query('COMMIT');
            res.json({ message: "Kayıt başarıyla silindi", deletedRecord: result.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`${table} tablosundan veri silme hatası:`, error);
            res.status(500).json({ error: error.message });
        } finally {
            client.release();
        }
    });
}

// Yerel geliştirme için Sunucu Başlatma
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Backend ${PORT} portunda çalışıyor`);
    });
}

// Vercel için dışa aktar
module.exports = app;
