// API Endpoints for new CRM features
const express = require('express');
const router = express.Router();

// Notifications Endpoints
router.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM crm_notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
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

// User Preferences Endpoints
router.get('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM crm_user_preferences WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default preferences if not exists
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

// User Profile Endpoints
router.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pool } = req.app.locals;
    
    const result = await pool.query(
      'SELECT * FROM crm_user_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default profile if not exists
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

// Search History Endpoints
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

// Activity Logs Endpoints
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

// User Favorites Endpoints
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

module.exports = router;