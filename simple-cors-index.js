// Simplified backend for fixing CORS and email functionality
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const SibApiV3Sdk = require('sib-api-v3-sdk');

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

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Setup Brevo Email API
let apiInstance = null;
try {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  console.log('✅ Brevo API client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Brevo API client:', error);
}

// Test Route for CORS
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working properly',
    headers: req.headers,
    origin: req.headers.origin || 'No origin'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Simple CORS backend is running',
    timestamp: new Date().toISOString(),
    email_status: apiInstance ? 'Email client is initialized' : 'Email client failed to initialize'
  });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by username
    const result = await pool.query('SELECT * FROM crm_users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    const user = result.rows[0];
    
    // Compare password with hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    // Return user data without password
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Email sending endpoint
app.post('/api/send-email-notification', async (req, res) => {
  console.log('📨 Email notification request received');
  
  try {
    if (!apiInstance) {
      return res.status(500).json({ error: 'Email client not initialized properly' });
    }
    
    const { to, subject, text, html, from = 'ucanisplus@gmail.com', fromName = 'TLC Metal CRM' } = req.body;
    
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ error: 'Recipient, subject, and message content are required' });
    }
    
    // Format recipients
    const toRecipients = Array.isArray(to) 
      ? to.map(email => ({ email })) 
      : [{ email: to }];
    
    // Create email message
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
    sendSmtpEmail.sender = { name: fromName, email: from };
    sendSmtpEmail.to = toRecipients;
    
    // Send the email
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully:', data);
    res.status(200).json({ success: true, message: 'Email sent successfully', data });
  } catch (error) {
    console.error('❌ Email sending error:', error);
    
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message,
      brevoError: error.response?.body
    });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;