# CORS Troubleshooting Guide for TLC Metal CRM Backend

This guide addresses CORS (Cross-Origin Resource Sharing) issues that may occur when deploying the backend API on Vercel.

## Understanding the Problem

The error message:

```
Access to fetch at 'https://crm-deneme-backend.vercel.app/api/login' from origin 'https://crm-deneme-1.vercel.app' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This means that the browser is attempting to make a cross-origin request to the backend API, but the server isn't responding correctly to the preflight OPTIONS request.

## Solutions Implemented

We've implemented multiple layers of CORS protection to ensure it works properly in the Vercel serverless environment:

1. **Custom CORS Middleware**: 
   - Located at `/middleware/cors.js`
   - Ensures proper CORS headers are set for every request
   - Handles OPTIONS preflight requests correctly

2. **Express CORS Package**:
   - Configured with specific origins: `['https://crm-deneme-1.vercel.app', 'http://localhost:3000']`
   - Allows all necessary methods and headers
   - Sets credentials to true for cookie/auth support

3. **Vercel.json Configuration**:
   - Adds CORS headers at the routing level
   - This ensures headers are present even before Express middleware runs
   - Critical for serverless function environments

## Testing CORS Functionality

1. **Use the Diagnostic Endpoint**:
   - Visit `https://crm-deneme-backend.vercel.app/api/cors-test`
   - A successful JSON response confirms CORS is working for GET requests

2. **Test with the HTML Tool**:
   - Open `cors-test.html` in your browser
   - Test different endpoints to see detailed responses and errors

3. **Check Network Tab**:
   - In browser developer tools, look at Network tab
   - For each request, check if OPTIONS preflight requests are succeeding
   - Look for CORS headers in the response

## Common Issues and Solutions

1. **Missing CORS Headers in OPTIONS Response**:
   - The custom middleware specifically handles OPTIONS requests
   - If still failing, check Vercel logs for middleware execution

2. **Vercel Configuration Not Taking Effect**:
   - Redeploy the application to ensure `vercel.json` changes are applied
   - Verify the headers using the Network tab in dev tools

3. **Only Specific Routes Failing**:
   - May indicate middleware execution order issues
   - Ensure custom middleware is applied before route handlers

4. **Email API Causing Issues**:
   - The Brevo/Sendinblue API integration shouldn't affect CORS
   - Issues might be related to changes made while adding this functionality
   - Use the test tool to specifically test the email endpoint

## Debugging Steps

If CORS issues persist:

1. Deploy with `NODE_ENV=development` to get more verbose logs
2. Check Vercel function logs for any errors or warnings
3. Test from different browsers and network environments
4. Verify the API endpoint works using tools like Postman (which bypass CORS)
5. Check response headers from the server using browser dev tools

## Vercel-Specific Considerations

Vercel's serverless environment requires special handling for CORS:

1. Headers must be present in the response to OPTIONS preflight requests
2. Middleware ordering matters more than in traditional Express apps
3. `vercel.json` configuration can override or complement Express middleware
4. Cold starts might affect the first request's performance

## Additional Resources

- [Vercel Documentation on CORS](https://vercel.com/guides/how-to-enable-cors)
- [Express CORS Package Documentation](https://expressjs.com/en/resources/middleware/cors.html)
- [MDN Web Docs on CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)