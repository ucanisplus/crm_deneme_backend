// diagnostic.js - Simple script to check CORS settings
require('dotenv').config();
const express = require('express');
const app = express();

// Ultra simple CORS handler
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Simple diagnostic endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CORS diagnostics running',
    headers_received: req.headers,
    timestamp: new Date().toISOString()
  });
});

// Test login endpoint
app.post('/api/login-test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'This is a test login response',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Diagnostic server running on port ${PORT}`);
});

module.exports = app;