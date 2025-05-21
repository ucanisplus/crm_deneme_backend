// Standalone API for sequence operations
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle GET request
  if (req.method === 'GET') {
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
  
  // If neither OPTIONS nor GET
  return res.status(405).json({ error: 'Method not allowed' });
};