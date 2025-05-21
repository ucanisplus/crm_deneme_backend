# CORS Configuration for Vercel Deployment

This document explains the CORS (Cross-Origin Resource Sharing) configuration implemented in this backend application.

## Implementation Details

CORS is configured in multiple layers to ensure it works properly in the Vercel serverless environment:

1. **Express CORS middleware**: The standard `cors` package is used to handle CORS for regular requests.

2. **Explicit OPTIONS handling**: A special middleware handles preflight OPTIONS requests explicitly, which can sometimes be problematic in serverless environments.

3. **Additional headers middleware**: A custom middleware applies CORS headers to all responses as a fallback.

4. **Vercel.json configuration**: CORS headers are also specified in the Vercel configuration file.

## Allowed Origins

The following origins are allowed to access this API:

- `https://crm-deneme-1.vercel.app` (production frontend)
- `http://localhost:3000` (local development)
- `http://localhost:3001` (alternative local development port)

## CORS Headers Applied

- `Access-Control-Allow-Origin`: Specifies which origins can access the resource
- `Access-Control-Allow-Methods`: Allowed HTTP methods (GET, POST, PUT, DELETE, OPTIONS)
- `Access-Control-Allow-Headers`: Allowed request headers
- `Access-Control-Allow-Credentials`: Allows requests to include credentials (cookies, authorization headers)
- `Access-Control-Max-Age`: Duration (in seconds) preflight results can be cached

## Troubleshooting

If CORS issues persist:

1. Check browser console for specific CORS error messages
2. Verify that the frontend origin is included in the `allowedOrigins` array
3. Ensure that all required headers are being sent in requests
4. Check if credentials are being properly handled (if using cookies/authorization)

## Reference

For more information on CORS:
- [MDN Web Docs: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Express CORS middleware](https://expressjs.com/en/resources/middleware/cors.html)
- [Vercel documentation on headers](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes#node.js-request-and-response-objects)