// Standalone API for email notifications
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Initialize Brevo/Sendinblue client
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

module.exports = async (req, res) => {
  // Set CORS headers directly for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle email sending
  if (req.method === 'POST') {
    console.log('📨 Email notification request received');
    
    try {
      if (!apiInstance) {
        return res.status(500).json({ error: 'Email client not initialized properly' });
      }
      
      const { to, subject, text, html, from = 'ucanisplus@gmail.com', fromName = 'TLC Metal CRM', cc, bcc, replyTo } = req.body;
      
      if (!to || !subject || (!text && !html)) {
        return res.status(400).json({ error: 'Alıcı (to), konu (subject) ve mesaj içeriği (text veya html) gereklidir' });
      }
      
      // Format recipients correctly
      const toRecipients = Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }];
      
      // Format CC recipients (if provided)
      const ccRecipients = cc ? (Array.isArray(cc) ? cc.map(email => ({ email })) : [{ email: cc }]) : [];
      
      // Format BCC recipients (if provided)
      const bccRecipients = bcc ? (Array.isArray(bcc) ? bcc.map(email => ({ email })) : [{ email: bcc }]) : [];
      
      // Create email message
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
      sendSmtpEmail.sender = { name: fromName, email: from || 'ucanisplus@gmail.com' };
      sendSmtpEmail.to = toRecipients;
      
      // Add optional fields
      if (ccRecipients.length > 0) sendSmtpEmail.cc = ccRecipients;
      if (bccRecipients.length > 0) sendSmtpEmail.bcc = bccRecipients;
      if (replyTo) sendSmtpEmail.replyTo = { email: replyTo };
      if (text) sendSmtpEmail.textContent = text;
      
      console.log('📧 Sending email:', {
        to: Array.isArray(to) ? to.join(', ') : to,
        from: from || 'ucanisplus@gmail.com',
        subject
      });
      
      // Send the email
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      
      console.log('✅ Email sent successfully:', data);
      return res.status(200).json({ success: true, message: 'E-posta başarıyla gönderildi', data });
    } catch (error) {
      console.error('❌ Email sending error:', error);
      
      // Check for Brevo-specific error messages
      if (error.response && error.response.body) {
        console.error('Brevo response error:', error.response.body);
        
        return res.status(500).json({
          error: 'E-posta gönderilemedi',
          details: error.message,
          brevoError: error.response.body
        });
      }
      
      return res.status(500).json({
        error: 'E-posta gönderilemedi',
        details: error.message
      });
    }
  }
  
  // If neither OPTIONS nor POST
  return res.status(405).json({ error: 'Method not allowed' });
};