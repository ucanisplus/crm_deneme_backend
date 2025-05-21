# TLC Metal CRM Backend

This is the backend API for the TLC Metal CRM system. It provides authentication, database access, and email notification functionality.

## Important Files

- `index.js` - The main backend application with simplified CORS handling
- `vercel.json` - Configuration for Vercel deployment with CORS headers
- `test-direct.js` - Script to test the backend directly (bypassing browser CORS)

## Key Features

- User authentication with JWT tokens
- PostgreSQL database integration for storing product and user data
- Email notifications via Brevo/Sendinblue API
- CORS configuration for cross-origin requests

## CORS Solution

The backend implements CORS headers in multiple layers:

1. Special handler for OPTIONS preflight requests
2. CORS middleware for all other requests
3. CORS headers in the Vercel routing configuration

This ensures that browsers can make cross-origin requests from the frontend application.

## Testing CORS

You can test if CORS is working by visiting:
- `https://crm-deneme-backend.vercel.app/api/cors-test`

Or by using the test HTML file provided:
- `cors-test.html`

## Troubleshooting

If you encounter CORS issues:

1. Check browser console for detailed error messages
2. Verify that the backend is responding with the correct CORS headers
3. Make sure preflight OPTIONS requests are returning 200 status
4. Try running the `test-direct.js` script to bypass browser CORS

## Development

To run the backend locally:

```
npm install
npm start
```

The server will start on port 4000 by default.

## Deployment

The backend is configured for deployment on Vercel. Push changes to the repository to trigger a new deployment.