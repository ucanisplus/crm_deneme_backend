// Test the diagnostic API locally before deployment
const axios = require('axios');

// Start the diagnostic server
require('./diag-index');

// Wait for server to start
setTimeout(async () => {
  console.log('=== TESTING LOCAL DIAGNOSTIC SERVER ===');
  const LOCAL_URL = 'http://localhost:4000';
  
  try {
    // Test root endpoint
    console.log('\nTesting root endpoint...');
    const rootResponse = await axios.get(`${LOCAL_URL}/`);
    console.log('Status:', rootResponse.status);
    console.log('Data:', rootResponse.data);
    
    // Test CORS endpoint
    console.log('\nTesting CORS endpoint...');
    const corsResponse = await axios.get(`${LOCAL_URL}/api/cors-test`, {
      headers: {
        'Origin': 'https://crm-deneme-1.vercel.app'
      }
    });
    console.log('Status:', corsResponse.status);
    console.log('Has Access-Control-Allow-Origin header:', !!corsResponse.headers['access-control-allow-origin']);
    
    // Test OPTIONS request
    console.log('\nTesting OPTIONS request...');
    const optionsResponse = await axios({
      method: 'OPTIONS',
      url: `${LOCAL_URL}/api/login`,
      headers: {
        'Origin': 'https://crm-deneme-1.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    console.log('Status:', optionsResponse.status);
    console.log('Has Access-Control-Allow-Origin header:', !!optionsResponse.headers['access-control-allow-origin']);
    console.log('Has Access-Control-Allow-Methods header:', !!optionsResponse.headers['access-control-allow-methods']);
    
    // Test login endpoint
    console.log('\nTesting login endpoint...');
    const loginResponse = await axios.post(`${LOCAL_URL}/api/login`, {
      username: 'test',
      password: 'test'
    });
    console.log('Status:', loginResponse.status);
    console.log('Data:', loginResponse.data);
    
    // Test email endpoint
    console.log('\nTesting email endpoint...');
    const emailResponse = await axios.post(`${LOCAL_URL}/api/send-email-notification`, {
      to: 'test@example.com',
      subject: 'Test Email',
      text: 'This is a test email'
    });
    console.log('Status:', emailResponse.status);
    console.log('Data:', emailResponse.data);
    
    console.log('\n=== ALL TESTS PASSED ===');
    console.log('The diagnostic server is working correctly locally');
    console.log('Deploy to Vercel to test in production');
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  } finally {
    // Exit the process when done
    process.exit();
  }
}, 1000); // Give server 1 second to start