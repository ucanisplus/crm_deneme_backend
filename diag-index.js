// Diagnostic version of the backend for troubleshooting CORS issues
const express = require('express');
const app = express();

// Special handler for OPTIONS preflight requests
app.options('*', (req, res) => {
  console.log('Handling OPTIONS preflight request');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.status(200).send();
});

// CORS middleware for all other requests
app.use((req, res, next) => {
  console.log(`${req.method} request to ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Body parser middleware
app.use(express.json({ limit: '10mb' }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Diagnostic backend is running',
    timestamp: new Date().toISOString(),
    requestHeaders: req.headers
  });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working properly',
    headers: req.headers,
    origin: req.headers.origin || 'No origin header'
  });
});

// Login endpoint (simplified mock)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Always return mock data for diagnostic purposes
  res.json({
    message: 'This is a mock login response',
    user: {
      id: '12345',
      username: username,
      email: 'test@example.com',
      role: 'engineer_1'
    }
  });
});

// Email endpoint (mock)
app.post('/api/send-email-notification', (req, res) => {
  const { to, subject, text, html } = req.body;
  
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'Recipient, subject, and message content are required' });
  }
  
  // Return mock success response
  res.json({
    success: true,
    message: 'This is a mock email response (no email was actually sent)',
    emailDetails: {
      to,
      subject,
      text: text || 'No text content',
      html: html || 'No HTML content'
    }
  });
});

// Start server
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Diagnostic server running on port ${PORT}`);
  });
}

module.exports = app;