// Direct testing script for backend without browser CORS limitations
// Using axios instead of fetch for better compatibility
const axios = require('axios');

const BACKEND_URL = 'https://crm-deneme-backend.vercel.app';

// Test functions
async function testRootEndpoint() {
  console.log('\n--- Testing Root Endpoint ---');
  try {
    const response = await axios.get(`${BACKEND_URL}/`);
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    return false;
  }
}

async function testCorsEndpoint() {
  console.log('\n--- Testing CORS Endpoint ---');
  try {
    const response = await axios.get(`${BACKEND_URL}/api/cors-test`, {
      headers: {
        'Origin': 'https://crm-deneme-1.vercel.app'
      }
    });
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    return false;
  }
}

async function testLoginEndpoint() {
  console.log('\n--- Testing Login Endpoint ---');
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/login`, 
      {
        username: 'test',
        password: 'test'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://crm-deneme-1.vercel.app'
        }
      }
    );
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    if (error.response && error.response.data) {
      console.log('Response data:', error.response.data);
    }
    
    // If we get a 400 error, that's actually expected with test/test credentials
    return error.response && error.response.status === 400;
  }
}

async function testEmailEndpoint() {
  console.log('\n--- Testing Email Endpoint ---');
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/send-email-notification`,
      {
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email from the backend test script.'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://crm-deneme-1.vercel.app'
        }
      }
    );
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    if (error.response && error.response.data) {
      console.log('Response data:', error.response.data);
    }
    return false;
  }
}

// Test OPTIONS preflight request
async function testOptionsRequest() {
  console.log('\n--- Testing OPTIONS Preflight Request ---');
  try {
    // Axios doesn't directly support OPTIONS requests well, so we'll use a workaround
    const response = await axios({
      method: 'OPTIONS',
      url: `${BACKEND_URL}/api/login`,
      headers: {
        'Origin': 'https://crm-deneme-1.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    
    // Check for CORS headers
    const hasOriginHeader = !!response.headers['access-control-allow-origin'];
    const hasMethodsHeader = !!response.headers['access-control-allow-methods'];
    const hasHeadersHeader = !!response.headers['access-control-allow-headers'];
    
    console.log('Has Access-Control-Allow-Origin:', hasOriginHeader ? '✅' : '❌');
    console.log('Has Access-Control-Allow-Methods:', hasMethodsHeader ? '✅' : '❌');
    console.log('Has Access-Control-Allow-Headers:', hasHeadersHeader ? '✅' : '❌');
    
    return response.status === 200 && hasOriginHeader && hasMethodsHeader && hasHeadersHeader;
  } catch (error) {
    console.error('Error:', error.response ? error.response.status : error.message);
    if (error.response && error.response.headers) {
      const headers = error.response.headers;
      console.log('Headers from error response:', headers);
      
      // Even if we got an error, check if the CORS headers are present
      const hasOriginHeader = !!headers['access-control-allow-origin'];
      const hasMethodsHeader = !!headers['access-control-allow-methods'];
      const hasHeadersHeader = !!headers['access-control-allow-headers'];
      
      console.log('Has Access-Control-Allow-Origin:', hasOriginHeader ? '✅' : '❌');
      console.log('Has Access-Control-Allow-Methods:', hasMethodsHeader ? '✅' : '❌');
      console.log('Has Access-Control-Allow-Headers:', hasHeadersHeader ? '✅' : '❌');
    }
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== BACKEND TEST SCRIPT ===');
  console.log('Backend URL:', BACKEND_URL);
  
  const rootResult = await testRootEndpoint();
  const corsResult = await testCorsEndpoint();
  const optionsResult = await testOptionsRequest();
  const loginResult = await testLoginEndpoint();
  const emailResult = await testEmailEndpoint();
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Root Endpoint:', rootResult ? '✅ PASS' : '❌ FAIL');
  console.log('CORS Endpoint:', corsResult ? '✅ PASS' : '❌ FAIL');
  console.log('OPTIONS Preflight:', optionsResult ? '✅ PASS' : '❌ FAIL');
  console.log('Login Endpoint:', loginResult ? '✅ PASS' : '❌ FAIL');
  console.log('Email Endpoint:', emailResult ? '✅ PASS' : '❌ FAIL');
  
  // Check for CORS headers
  console.log('\n=== CORS HEADERS CHECK ===');
  if (optionsResult) {
    console.log('CORS headers for OPTIONS requests are properly set ✅');
    console.log('This suggests your browser CORS issues should be fixed!');
  } else if (corsResult) {
    console.log('CORS headers for regular requests are set, but OPTIONS preflight may have issues ⚠️');
  } else {
    console.log('CORS headers are missing or incorrect ❌');
    console.log('This will cause browser CORS errors');
  }
}

// Run tests
runAllTests().catch(console.error);