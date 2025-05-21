// Standalone API for data table operations
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
  
  // Extract the table name from the URL path
  // URL format is /api/{tableName} or /api/{tableName}/{id}
  const urlPath = req.url.split('?')[0];
  const pathParts = urlPath.split('/').filter(part => part);
  
  console.log('URL Path:', urlPath);
  console.log('Path Parts:', pathParts);
  
  let tableName = '';
  let idFromPath = '';
  
  if (pathParts.length > 0) {
    tableName = pathParts[0];
    if (pathParts.length > 1) {
      idFromPath = pathParts[1];
    }
  }
  
  // If tableName is empty, try to get it from the URL
  if (!tableName) {
    // Look for a table name in the URL parts
    for (const part of pathParts) {
      if (tables.includes(part)) {
        tableName = part;
        break;
      }
    }
  }
  
  // If still empty, check query parameters
  if (!tableName && req.query && req.query.tableName) {
    tableName = req.query.tableName;
  }
  
  console.log('Extracted Table Name:', tableName);
  console.log('ID from Path:', idFromPath);
  
  // Check if table is in our supported list
  if (!tables.includes(tableName)) {
    return res.status(400).json({ 
      error: `Unsupported table: ${tableName}`,
      url: req.url,
      path: urlPath,
      pathParts: pathParts,
      supportedTables: tables
    });
  }
  
  // Get ID from query if not in path
  if (!idFromPath && req.query && req.query.id) {
    idFromPath = req.query.id;
  }
  
  try {
    // Handle GET requests
    if (req.method === 'GET') {
      // Get query parameters from URL
      const { id, mm_gt_id, ym_gt_id, ym_st_id, kod_2, cap, stok_kodu, stok_kodu_like, ids, status, created_by } = req.query;
      
      // If ID is in the path, use it
      const requestId = idFromPath || id;
      
      let query = `SELECT * FROM ${tableName}`;
      const queryParams = [];
      let whereConditions = [];
      
      // Build WHERE conditions based on query parameters
      if (requestId) {
        whereConditions.push(`id = $${queryParams.length + 1}`);
        queryParams.push(requestId);
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
    
    else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error(`Error in ${tableName} operation:`, error);
    
    // For recipe tables, return empty array on 404 error for GET requests
    if (req.method === 'GET' && tableName.endsWith('_recete')) {
      console.log(`⚠️ No data found in ${tableName} table - returning empty array`);
      return res.json([]);
    }
    
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
    
    return res.status(500).json({ 
      error: `Error processing request for ${tableName}`,
      details: error.message,
      code: error.code
    });
  }
};