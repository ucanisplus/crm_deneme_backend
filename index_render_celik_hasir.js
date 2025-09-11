// RENDER-SPECIFIC DEPLOYMENT FOR CELIK HASIR
// This file should ONLY be deployed on Render for CelikHasir operations
// Replaces index_render_aps.js to handle CelikHasir without timeout limits

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { Redis } = require('@upstash/redis');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: false
}));

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

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// JSON parse error handling
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

// TIMESTAMP FIX: Remove problematic timestamp fields
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const removeTimestamps = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const result = Array.isArray(obj) ? [...obj] : { ...obj };
      
      for (const key of Object.keys(result)) {
        if (key.includes('_update') || key.includes('_tarihi') || 
            key.endsWith('_at') || key.includes('Date')) {
          console.log(`✂️ REMOVING problematic field: ${key}`);
          delete result[key];
        }
        else if (result[key] && typeof result[key] === 'object') {
          result[key] = removeTimestamps(result[key]);
        }
      }
      
      return result;
    };
    
    req.body = removeTimestamps(req.body);
    console.log('📝 FIXED: All timestamp fields removed');
  }
  
  next();
});

// PostgreSQL Connection - Same as Vercel backend
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
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
  generateCacheKey: (table, filters = {}, page = null, limit = null) => {
    const filterString = Object.keys(filters).length > 0 ? 
      JSON.stringify(filters, Object.keys(filters).sort()) : 'no-filters';
    const pageString = page ? `page:${page}` : 'no-page';
    const limitString = limit ? `limit:${limit}` : 'no-limit';
    return `celik_hasir:${table}:${filterString}:${pageString}:${limitString}`;
  },

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

  del: async (pattern) => {
    if (!redis) return false;
    try {
      if (pattern.includes('*')) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`🗑️ Cache cleared: ${keys.length} keys matching ${pattern}`);
        }
      } else {
        await redis.del(pattern);
        console.log(`🗑️ Cache cleared: ${pattern}`);
      }
      return true;
    } catch (error) {
      console.error('Cache DEL error:', error);
      return false;
    }
  },

  clearTableCache: async (table) => {
    return await cacheHelpers.del(`celik_hasir:${table}:*`);
  }
};

// Database error handling
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Number normalization helper
const normalizeNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return null;
    }
    
    if (value.includes(',')) {
      return parseFloat(value.replace(/,/g, '.'));
    }
    
    return parseFloat(value);
  }
  
  return value;
};

// Health check endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Render CelikHasir Backend is running',
    features: ['CelikHasir CRUD', 'Bulk Operations', 'No Timeout Limits'],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'CelikHasir Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({
      status: 'success',
      message: 'Database connection successful',
      current_time: result.rows[0].current_time
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Ping endpoint for keepalive
app.get('/api/ping', (req, res) => {
  res.json({ 
    status: 'pong',
    timestamp: new Date().toISOString()
  });
});

// Warmup endpoint
app.post('/api/warmup', (req, res) => {
  res.json({
    status: 'warmed',
    message: 'Render server is ready',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// CELIK HASIR BULK DELETE ENDPOINTS
// ========================================

// Bulk delete recipes by mamul_kodu
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

// Bulk delete products by stok_kodu
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

// ========================================
// MESH-CONFIGS ENDPOINTS (used by CelikHasir for optimization)
// ========================================

app.get('/api/mesh-configs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM mesh_type_configs ORDER BY type, hasir_tipi'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mesh configurations:', error);
    res.status(500).json({ error: 'Failed to fetch mesh configurations' });
  }
});

app.get('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    
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

app.post('/api/mesh-configs', async (req, res) => {
  try {
    const { hasirTipi, boyCap, enCap, boyAralik, enAralik, type, description } = req.body;
    
    // Validate required fields
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
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Mesh type already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create mesh configuration' });
    }
  }
});

app.put('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    const { boyCap, enCap, boyAralik, enAralik, type, description } = req.body;
    
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

app.delete('/api/mesh-configs/:hasirTipi', async (req, res) => {
  try {
    const { hasirTipi } = req.params;
    
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

app.get('/api/mesh-configs/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
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

// ========================================
// CELIK HASIR TABLES AND GENERIC CRUD
// ========================================

// CelikHasir table definitions
const celikHasirTables = [
  'celik_hasir_netsis_mm',
  'celik_hasir_netsis_ym_ncbk', 
  'celik_hasir_netsis_ym_ntel',
  'celik_hasir_netsis_mm_recete',
  'celik_hasir_netsis_ncbk_recete',
  'celik_hasir_netsis_ntel_recete',
  'celik_hasir_netsis_sequence'
];

// Generic GET endpoint for CelikHasir tables
celikHasirTables.forEach(table => {
  app.get(`/api/${table}`, async (req, res) => {
    try {
      const {
        hasir_tipi, boy_cap, en_cap, uzunluk_boy, uzunluk_en, goz_araligi,
        stok_adi_like, id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap,
        stok_kodu, stok_kodu_like, ids, status, created_by, request_id,
        mamul_kodu, page = 1, limit = 1000, sort_by = 'id', sort_order = 'ASC'
      } = req.query;

      console.log(`🔍 GET ${table} - Query params:`, req.query);

      // Check cache first
      const cacheKey = cacheHelpers.generateCacheKey(table, req.query, page, limit);
      const cachedResult = await cacheHelpers.get(cacheKey);
      if (cachedResult) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedResult);
      }

      let query = `SELECT * FROM ${table}`;
      const queryParams = [];
      let whereConditions = [];

      // Apply CelikHasir specific filters
      if (hasir_tipi) {
        whereConditions.push(`hasir_tipi = $${queryParams.length + 1}`);
        queryParams.push(hasir_tipi);
      }
      if (boy_cap) {
        whereConditions.push(`boy_cap = $${queryParams.length + 1}`);
        queryParams.push(normalizeNumber(boy_cap));
      }
      if (en_cap) {
        whereConditions.push(`en_cap = $${queryParams.length + 1}`);
        queryParams.push(normalizeNumber(en_cap));
      }
      if (uzunluk_boy) {
        whereConditions.push(`uzunluk_boy = $${queryParams.length + 1}`);
        queryParams.push(normalizeNumber(uzunluk_boy));
      }
      if (uzunluk_en) {
        whereConditions.push(`uzunluk_en = $${queryParams.length + 1}`);
        queryParams.push(normalizeNumber(uzunluk_en));
      }
      if (goz_araligi) {
        whereConditions.push(`goz_araligi = $${queryParams.length + 1}`);
        queryParams.push(goz_araligi);
      }
      if (stok_adi_like) {
        whereConditions.push(`stok_adi LIKE $${queryParams.length + 1}`);
        queryParams.push(`%${stok_adi_like}%`);
      }
      if (stok_kodu) {
        whereConditions.push(`stok_kodu = $${queryParams.length + 1}`);
        queryParams.push(stok_kodu);
      }
      if (stok_kodu_like) {
        whereConditions.push(`stok_kodu LIKE $${queryParams.length + 1}`);
        queryParams.push(`${stok_kodu_like}%`);
      }
      if (id) {
        whereConditions.push(`id = $${queryParams.length + 1}`);
        queryParams.push(id);
      }
      if (ids) {
        const idArray = ids.split(',').map(id => id.trim()).filter(id => id);
        if (idArray.length > 0) {
          const placeholders = idArray.map((_, index) => `$${queryParams.length + index + 1}`).join(',');
          whereConditions.push(`id IN (${placeholders})`);
          queryParams.push(...idArray);
        }
      }
      if (mamul_kodu && table.includes('_recete')) {
        whereConditions.push(`mamul_kodu = $${queryParams.length + 1}`);
        queryParams.push(mamul_kodu);
      }

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      query += ` ORDER BY ${sort_by} ${sort_order.toUpperCase()}`;

      // Apply pagination
      if (limit && limit !== 'all') {
        const offset = (page - 1) * limit;
        query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);
      }

      console.log(`🔍 Query: ${query}`);
      console.log(`🔍 Params: ${JSON.stringify(queryParams)}`);

      const result = await pool.query(query, queryParams);

      // Cache the results
      await cacheHelpers.set(cacheKey, result.rows);
      
      res.setHeader('X-Cache', 'MISS');
      res.json(result.rows);

    } catch (error) {
      console.error(`❌ GET ${table} error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generic POST endpoint for CelikHasir tables
  app.post(`/api/${table}`, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let data = req.body;
      console.log(`📝 POST ${table}:`, data);

      // Normalize numbers
      const normalizedData = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' && value.includes(',')) {
          normalizedData[key] = normalizeNumber(value);
        } else {
          normalizedData[key] = value;
        }
      }

      const columns = Object.keys(normalizedData);
      const values = Object.values(normalizedData);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

      const query = `
        INSERT INTO ${table} (${columns.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING *
      `;

      console.log(`🔍 Insert Query: ${query}`);
      console.log(`🔍 Values: ${JSON.stringify(values)}`);

      const result = await client.query(query, values);
      await client.query('COMMIT');

      // Clear cache
      await cacheHelpers.clearTableCache(table);

      console.log(`✅ Created ${table}:`, result.rows[0]);
      res.status(201).json(result.rows[0]);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ POST ${table} error:`, error);
      
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ 
          error: 'Duplicate entry', 
          details: error.detail || 'Record already exists'
        });
      } else {
        res.status(500).json({ error: error.message });
      }
    } finally {
      client.release();
    }
  });

  // Generic PUT endpoint for CelikHasir tables
  app.put(`/api/${table}/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { id } = req.params;
      let data = req.body;
      
      console.log(`🔄 PUT ${table}/${id}:`, data);

      // Normalize numbers
      const normalizedData = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' && value.includes(',')) {
          normalizedData[key] = normalizeNumber(value);
        } else {
          normalizedData[key] = value;
        }
      }

      const columns = Object.keys(normalizedData);
      const values = Object.values(normalizedData);
      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

      const query = `
        UPDATE ${table} 
        SET ${setClause} 
        WHERE id = $${columns.length + 1} 
        RETURNING *
      `;

      const result = await client.query(query, [...values, id]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Record not found" });
      }

      await client.query('COMMIT');

      // Clear cache
      await cacheHelpers.clearTableCache(table);

      console.log(`✅ Updated ${table}/${id}:`, result.rows[0]);
      res.json(result.rows[0]);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ PUT ${table}/${id} error:`, error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Generic DELETE endpoint for CelikHasir tables  
  app.delete(`/api/${table}/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { id } = req.params;
      console.log(`🗑️ DELETE ${table}/${id}`);

      // Handle cascade deletes for CelikHasir tables
      if (table === 'celik_hasir_netsis_mm') {
        await client.query('DELETE FROM celik_hasir_netsis_mm_recete WHERE mm_id = $1', [id]);
      } else if (table === 'celik_hasir_netsis_ym_ncbk') {
        await client.query('DELETE FROM celik_hasir_netsis_ncbk_recete WHERE ncbk_id = $1', [id]);
      } else if (table === 'celik_hasir_netsis_ym_ntel') {
        await client.query('DELETE FROM celik_hasir_netsis_ntel_recete WHERE ntel_id = $1', [id]);
      }

      const query = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: "Record not found" });
      }
      
      await client.query('COMMIT');

      // Clear cache
      await cacheHelpers.clearTableCache(table);
      
      console.log(`✅ Deleted ${table}/${id}:`, result.rows[0]);
      res.json({ 
        message: "Record deleted successfully", 
        deletedRecord: result.rows[0] 
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ DELETE ${table}/${id} error:`, error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Render CelikHasir Backend running on port ${PORT}`);
  console.log('🎯 Optimized for CelikHasir operations without timeout limits');
  console.log('Available endpoints:');
  console.log('  GET / - Health check');
  console.log('  GET /api/health - Detailed health status');
  console.log('  GET /api/test-db - Database connection test');
  console.log('  GET /api/ping - Keepalive ping');
  console.log('  POST /api/warmup - Server warmup');
});

module.exports = app;