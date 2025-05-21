// Extremely minimal Express server with CORS for Vercel deployment
const express = require('express');
const app = express();

// Middleware to add CORS headers to all responses
app.use((req, res, next) => {
  // Allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Allow common methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  // Allow common headers
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Simple test endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Minimal CORS test server is working',
    timestamp: new Date().toISOString()
  });
});

// Test auth endpoint
app.post('/api/login', (req, res) => {
  // Since this is just for testing CORS, accept any credentials
  res.json({
    success: true,
    message: 'Login successful (test mode)',
    user: {
      id: 'test-user-id',
      username: 'test-user',
      role: 'admin'
    }
  });
});

// Export the Express app for Vercel
module.exports = app;

// Start the server if running directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}