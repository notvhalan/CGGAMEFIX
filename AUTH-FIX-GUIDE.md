# Auth Configuration Summary

## The Problem:
Your app had hardcoded `localhost:3000` URLs, so when you tried to log in from your phone, it redirected to `localhost` on the phone (which doesn't exist).

## The Fix:
Updated all hardcoded localhost URLs to use environment variables that point to your public domain.

## What Changed:

### Frontend Files Updated:
- `apps/web/app/root.tsx` - Added ENV script to pass API URLs to browser
- `apps/web/app/routes/admin.tsx` - Uses window.ENV.API_URL
- `apps/web/app/routes/auth.login.tsx` - Uses window.ENV.API_URL  
- `apps/web/app/lib/auth.server.ts` - Uses VITE_API_URL env var
- `apps/web/app/lib/api.server.ts` - Uses VITE_API_URL env var

### Environment Variables in ECS Task:
```
VITE_API_URL=https://api.gamefix.fun
VITE_WS_URL=wss://api.gamefix.fun
```

These are already set in your ECS task definition, so auth will work once you redeploy.

## Backend Setup Needed:

For the backend (which runs locally), you need to:

### 1. Set up Cloudflare Tunnel

**Configure the tunnel to expose your local backend:**

```powershell
# In Cloudflare dashboard: Zero Trust → Tunnels → betting-exchange-api → Configure
# Add Public Hostname:
#   Subdomain: api
#   Domain: gamefix.fun
#   Type: HTTP
#   URL: localhost:3000
```

### 2. Update Google OAuth Callback URL

**In Google Cloud Console** (https://console.cloud.google.com/):
1. Go to: APIs & Services → Credentials
2. Find your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   https://api.gamefix.fun/v1/auth/google/callback
   ```
4. Save

### 3. Update Backend Environment Variables

Create `.env` file in project root (if it doesn't exist):

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://api.gamefix.fun/v1/auth/google/callback

# Auth redirects (where to send users after login)
AUTH_SUCCESS_REDIRECT=http://gamefix.fun:3001/app
AUTH_FAILURE_REDIRECT=http://gamefix.fun:3001/auth/login

# CORS (allow your frontend domain)
CORS_ORIGINS=http://gamefix.fun:3001,https://gamefix.fun:3001

# Session
SESSION_SECRET=your-secure-random-secret-here
```

### 4. Start Everything

**Terminal 1 - Start local services:**
```powershell
docker-compose up -d
pnpm run dev
```

**Terminal 2 - Run Cloudflare Tunnel:**
```powershell
cloudflared tunnel run betting-exchange-api
```

## Testing:

1. Deploy frontend: `.\deploy-with-auth-fix.ps1`
2. Update DNS after deployment: `.\update-dns-after-deploy.ps1`
3. Start backend + tunnel (see step 4 above)
4. On your phone, go to: `http://gamefix.fun:3001`
5. Click login → Google auth → Should work! ✅

## How It Works Now:

```
Phone Browser → http://gamefix.fun:3001
    ↓
Clicks "Login with Google"
    ↓
Redirects to: https://api.gamefix.fun/v1/auth/google
    ↓
Cloudflare Tunnel routes to: localhost:3000/v1/auth/google (your computer)
    ↓
Backend redirects to Google OAuth
    ↓
User logs in with Google
    ↓  
Google redirects to: https://api.gamefix.fun/v1/auth/google/callback
    ↓
Cloudflare Tunnel → your local backend
    ↓
Backend creates session, redirects to: http://gamefix.fun:3001/app
    ↓
✅ User is logged in!
```

No more localhost redirects = Works on any device! 🎉
