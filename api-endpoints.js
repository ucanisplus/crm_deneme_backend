// Yeni CRM özellikleri için API Endpoints
const express = require('express');
const router = express.Router();

// Veritabanı bağlantısını doğrulamak için test endpoint'i
router.get('/api/test-notifications', async (req, res) => {
  try {
    const { pool } = req.app.locals;

    // Tablo var mı kontrol et
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'crm_notifications'
      );
    `);

    // Bildirim sayısını getir
    const countResult = await pool.query('SELECT COUNT(*) FROM crm_notifications');
    
    res.json({
      tableExists: tableCheck.rows[0].exists,
      notificationCount: countResult.rows[0].count,
      message: 'Database connection successful'
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.json({
      error: error.message,
      message: 'Database connection failed'
    });
  }
});

// Bildirimler Endpoints
router.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;

    // Bu kullanıcı için bildirim var mı önce kontrol et
    const result = await pool.query(
      'SELECT * FROM crm_notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Boş olsa bile her zaman dizi döndür
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    // 500 hatası yerine boş dizi döndür
    res.json([]);
  }
});

router.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'UPDATE crm_notifications SET is_read = true WHERE id = $1 RETURNING *',
      [id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

router.put('/api/notifications/mark-all-read/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    await pool.query(
      'UPDATE crm_notifications SET is_read = true WHERE user_id = $1',
      [userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

router.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pool } = req.app.locals;
    
    await pool.query('DELETE FROM crm_notifications WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Bildirim oluşturma endpoint'i
router.post('/api/notifications', async (req, res) => {
  try {
    const { user_id, title, message, type = 'info', icon, action_link } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `INSERT INTO crm_notifications (user_id, title, message, type, icon, action_link) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [user_id, title, message, type, icon, action_link]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Kullanıcı Tercihleri Endpoints
router.get('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;

    const result = await pool.query(
      'SELECT * FROM crm_user_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Yoksa varsayılan tercihleri oluştur
      const insertResult = await pool.query(
        'INSERT INTO crm_user_preferences (user_id) VALUES ($1) RETURNING *',
        [userId]
      );
      res.json(insertResult.rows[0]);
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { email_notifications, system_notifications, language, theme } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `UPDATE crm_user_preferences 
       SET email_notifications = $2, system_notifications = $3, language = $4, theme = $5 
       WHERE user_id = $1 
       RETURNING *`,
      [userId, email_notifications, system_notifications, language, theme]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Kullanıcı Profili Endpoints
router.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;

    const result = await pool.query(
      'SELECT * FROM crm_user_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Yoksa varsayılan profil oluştur
      const insertResult = await pool.query(
        'INSERT INTO crm_user_profiles (user_id) VALUES ($1) RETURNING *',
        [userId]
      );
      res.json(insertResult.rows[0]);
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { phone, department, profile_picture_url } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `UPDATE crm_user_profiles 
       SET phone = $2, department = $3, profile_picture_url = $4 
       WHERE user_id = $1 
       RETURNING *`,
      [userId, phone, department, profile_picture_url]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Arama Geçmişi Endpoints
router.post('/api/search-history', async (req, res) => {
  try {
    const { user_id, search_term, search_category, results_count } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `INSERT INTO crm_search_history (user_id, search_term, search_category, results_count) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [user_id, search_term, search_category, results_count]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving search history:', error);
    res.status(500).json({ error: 'Failed to save search history' });
  }
});

router.get('/api/search-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM crm_search_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching search history:', error);
    res.status(500).json({ error: 'Failed to fetch search history' });
  }
});

// Aktivite Logları Endpoints
router.post('/api/activity-log', async (req, res) => {
  try {
    const { user_id, activity_type, activity_description, module, ip_address, user_agent } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `INSERT INTO crm_activity_logs (user_id, activity_type, activity_description, module, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [user_id, activity_type, activity_description, module, ip_address, user_agent]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// Kullanıcı Favorileri Endpoints
router.get('/api/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM crm_user_favorites WHERE user_id = $1 ORDER BY order_index',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

router.post('/api/favorites', async (req, res) => {
  try {
    const { user_id, title, link, icon, category } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `INSERT INTO crm_user_favorites (user_id, title, link, icon, category) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [user_id, title, link, icon, category]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/api/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pool } = req.app.locals;
    
    await pool.query('DELETE FROM crm_user_favorites WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting favorite:', error);
    res.status(500).json({ error: 'Failed to delete favorite' });
  }
});

// Hasır Tipi Konfigürasyon Endpoints
router.get('/api/mesh-configs', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM mesh_type_configs ORDER BY type, hasir_tipi'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mesh configurations:', error);
    res.status(500).json({ error: 'Failed to fetch mesh configurations' });
  }
});

router.get('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM mesh_type_configs WHERE hasir_tipi = $1',
      [hasirTipi]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mesh configuration not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching mesh configuration:', error);
    res.status(500).json({ error: 'Failed to fetch mesh configuration' });
  }
});

router.post('/api/mesh-configs', async (req, res) => {
  try {
    const { hasirTipi, boyCap, enCap, boyAralik, enAralik, type, description } = req.body;
    const { pool } = req.app.locals;

    // Gerekli alanları doğrula
    if (!hasirTipi || !boyCap || !enCap || !boyAralik || !enAralik || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await pool.query(
      `INSERT INTO mesh_type_configs (hasir_tipi, boy_cap, en_cap, boy_aralik, en_aralik, type, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [hasirTipi, boyCap, enCap, boyAralik, enAralik, type, description]
    );
    
    res.status(201).json({ 
      message: 'Mesh configuration created successfully',
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Error creating mesh configuration:', error);
    if (error.code === '23505') { // Unique constraint ihlali
      res.status(409).json({ error: 'Mesh type already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create mesh configuration' });
    }
  }
});

router.put('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    const { boyCap, enCap, boyAralik, enAralik, type, description } = req.body;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      `UPDATE mesh_type_configs 
       SET boy_cap = $2, en_cap = $3, boy_aralik = $4, en_aralik = $5, type = $6, description = $7
       WHERE hasir_tipi = $1 
       RETURNING *`,
      [hasirTipi, boyCap, enCap, boyAralik, enAralik, type, description]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mesh configuration not found' });
    }
    
    res.json({
      message: 'Mesh configuration updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating mesh configuration:', error);
    res.status(500).json({ error: 'Failed to update mesh configuration' });
  }
});

router.delete('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'DELETE FROM mesh_type_configs WHERE hasir_tipi = $1 RETURNING *',
      [hasirTipi]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mesh configuration not found' });
    }
    
    res.json({ 
      message: 'Mesh configuration deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting mesh configuration:', error);
    res.status(500).json({ error: 'Failed to delete mesh configuration' });
  }
});

router.get('/api/mesh-configs/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM mesh_type_configs WHERE type = $1 ORDER BY hasir_tipi',
      [type.toUpperCase()]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mesh configurations by type:', error);
    res.status(500).json({ error: 'Failed to fetch mesh configurations by type' });
  }
});

module.exports = router;