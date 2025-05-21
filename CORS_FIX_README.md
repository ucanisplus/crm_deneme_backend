# CORS Fix - Serverless API Approach

This document explains the CORS (Cross-Origin Resource Sharing) solution implemented for this backend application hosted on Vercel.

## Problem

The application was experiencing CORS issues, particularly with preflight OPTIONS requests, which were preventing the frontend from successfully communicating with the backend APIs. 

Error example:
```
Access to fetch at 'https://crm-deneme-backend.vercel.app/api/login' from origin 'https://crm-deneme-1.vercel.app' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution: Serverless API Approach

We implemented a serverless API approach where each critical endpoint has its own standalone API file with dedicated CORS handling:

1. Each API endpoint is implemented as a standalone serverless function in the `/api` directory
2. Each function handles its own CORS headers directly
3. Each function handles preflight OPTIONS requests explicitly
4. The `vercel.json` configuration routes specific endpoints to these API files

### Implementation Details:

#### 1. API Directory Structure
```
/api
├── check-recipes.js           # Check if recipes exist
├── login.js                   # Handles user authentication
├── profile-picture.js         # Handles profile picture operations
├── sal-requests-approve.js    # Handles approving SAL requests
├── sal-requests-count.js      # Counts SAL requests
├── sal-requests-reject.js     # Handles rejecting SAL requests
├── send-email-notification.js # Handles email notifications
├── sequence.js                # Handles sequence number generation
├── signup.js                  # Handles user registration
├── tables.js                  # Generic handler for database table operations
├── test.js                    # Tests database connection
└── user-permissions.js        # Handles user permissions
```

#### 2. CORS Headers Implementation

Each API file includes the following CORS handling code:

```javascript
// Set CORS headers directly for this endpoint
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); // Methods specific to the endpoint
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

// Handle OPTIONS request
if (req.method === 'OPTIONS') {
  return res.status(200).end();
}
```

#### 3. Vercel.json Configuration

The vercel.json file has been updated to route specific endpoints to their respective API files. For example:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    },
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/login",
      "dest": "/api/login.js"
    },
    {
      "src": "/api/signup",
      "dest": "/api/signup.js"
    },
    {
      "src": "/api/test",
      "dest": "/api/test.js"
    },
    {
      "src": "/api/send-email-notification",
      "dest": "/api/send-email-notification.js"
    },
    {
      "src": "/api/user/permissions/:userId",
      "dest": "/api/user-permissions.js?userId=$1"
    },
    {
      "src": "/api/user/profile-picture",
      "dest": "/api/profile-picture.js"
    },
    {
      "src": "/api/gal_cost_cal_sequence/next",
      "dest": "/api/sequence.js"
    },
    {
      "src": "/api/check-recipes",
      "dest": "/api/check-recipes.js"
    },
    // Database table routes
    {
      "src": "/api/gal_cost_cal_mm_gt",
      "dest": "/api/tables.js"
    },
    // ...more routes...
    {
      "src": "/(.*)",
      "dest": "/index.js"
    }
  ]
}
```

#### 4. Database Table Handling

The `tables.js` API file is a generic handler for all database table operations, supporting:

- GET - Retrieve records
- POST - Create new records
- PUT - Update existing records
- DELETE - Delete records

It supports all tables used in the application, including:
- Galvanizli Tel tables (gal_cost_cal_*)
- Panel Çit tables (panel_cost_cal_*)

#### 5. Testing

We've included a `cors-test.html` file that can be used to test the endpoints and verify CORS headers are working correctly.

To use it:
1. Open the HTML file in a web browser
2. Click on the different test buttons to test each endpoint
3. Check for CORS headers in the response
4. Test preflight OPTIONS requests

## Advantages of this Approach

1. **Simplicity**: Each endpoint handles its own CORS headers directly
2. **Isolation**: Issues with one endpoint don't affect others
3. **Better control**: Fine-grained control over headers for each endpoint
4. **Compatibility with Vercel**: Works well with Vercel's serverless architecture

## Future Enhancements

If additional endpoints need CORS support, simply:

1. Create a new file in the `/api` directory
2. Implement the endpoint with the same CORS handling pattern
3. Update `vercel.json` to route to the new file

## Troubleshooting

If CORS issues persist:

1. Use the `cors-test.html` file to test endpoints and verify headers
2. Check browser console for detailed error messages
3. Ensure preflight OPTIONS requests are responding with status 200
4. Verify that all required CORS headers are present in the response
5. Make sure the Vercel deployment has the latest version of the code
6. Check that the frontend is using the correct API URL