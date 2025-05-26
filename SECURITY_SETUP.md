# Security Setup for Vercel Deployment

## Important Security Steps

### 1. Remove Exposed API Keys
If your API keys have been exposed:
1. **Immediately revoke/regenerate all API keys**:
   - Brevo: Go to your Brevo dashboard > SMTP & API > API Keys
   - Resend: Go to resend.com/api-keys
   - Database: Change your database password

2. **Remove .env from Git history**:
   ```bash
   git rm --cached .env
   git commit -m "Remove .env file"
   git push
   ```

### 2. Using Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to Settings > Environment Variables
4. Add your variables:
   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - `PORT`
   - `NODE_ENV`

### 3. Using Serverless Functions (More Secure)

Instead of calling your backend directly, use the serverless function:

**Frontend code update needed in SatisGalvanizRequest.jsx:**
```javascript
// Change from:
const emailResponse = await fetch(`${backendUrl}/send-galvaniz-notification`, {...})

// To:
const emailResponse = await fetch('/api/send-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestData: request, requestId: data.id })
});
```

### 4. Deployment Structure

For maximum security, use this structure:
- **Frontend**: Deploy to Vercel (crm_deneme_1)
- **API Functions**: Use Vercel Serverless Functions (/api folder)
- **Backend**: Keep only for database operations (no API keys in code)

### 5. Best Practices

1. **Never commit .env files**
2. **Use different API keys for development and production**
3. **Rotate API keys regularly**
4. **Monitor for exposed secrets using GitHub secret scanning**
5. **Use Vercel's built-in environment variable encryption**

## Quick Checklist

- [ ] .env file is in .gitignore
- [ ] All API keys removed from code
- [ ] Environment variables set in Vercel dashboard
- [ ] Old/exposed API keys revoked
- [ ] Using serverless functions for sensitive operations