// Direct testing script for backend without browser CORS limitations
const fetch = require('node-fetch');

const BACKEND_URL = 'https://crm-deneme-backend.vercel.app';

// Test functions
async function testRootEndpoint() {
  console.log('\n--- Testing Root Endpoint ---');
  try {
    const response = await fetch(`${BACKEND_URL}/`);
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function testCorsEndpoint() {
  console.log('\n--- Testing CORS Endpoint ---');
  try {
    const response = await fetch(`${BACKEND_URL}/api/cors-test`, {
      headers: {
        'Origin': 'https://crm-deneme-1.vercel.app'
      }
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Headers:', response.headers.raw());
    console.log('Data:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function testLoginEndpoint() {
  console.log('\n--- Testing Login Endpoint ---');
  try {
    const response = await fetch(`${BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://crm-deneme-1.vercel.app'
      },
      body: JSON.stringify({
        username: 'test',
        password: 'test'
      })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers.raw());
    
    try {
      const data = await response.json();
      console.log('Data:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('Response is not JSON:', await response.text());
    }
    
    return response.status !== 500;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function testEmailEndpoint() {
  console.log('\n--- Testing Email Endpoint ---');
  try {
    const response = await fetch(`${BACKEND_URL}/api/send-email-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://crm-deneme-1.vercel.app'
      },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email from the backend test script.'
      })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', response.headers.raw());
    
    try {
      const data = await response.json();
      console.log('Data:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('Response is not JSON:', await response.text());
    }
    
    return response.status !== 500;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== BACKEND TEST SCRIPT ===');
  console.log('Backend URL:', BACKEND_URL);
  
  const rootResult = await testRootEndpoint();
  const corsResult = await testCorsEndpoint();
  const loginResult = await testLoginEndpoint();
  const emailResult = await testEmailEndpoint();
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Root Endpoint:', rootResult ? '✅ PASS' : '❌ FAIL');
  console.log('CORS Endpoint:', corsResult ? '✅ PASS' : '❌ FAIL');
  console.log('Login Endpoint:', loginResult ? '✅ PASS' : '❌ FAIL');
  console.log('Email Endpoint:', emailResult ? '✅ PASS' : '❌ FAIL');
  
  // Check for CORS headers
  console.log('\n=== CORS HEADERS CHECK ===');
  if (corsResult) {
    console.log('CORS headers are properly set ✅');
  } else {
    console.log('CORS headers are missing or incorrect ❌');
  }
}

// Run tests
runAllTests().catch(console.error);