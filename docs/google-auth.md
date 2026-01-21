# Google OAuth Authentication - Implementation Guide

## Overview

Google "Sign in with Google" OAuth has been added to the API Gateway (NestJS + Fastify).

## Files Created

### Database Layer
- `apps/api-gateway/src/database/database.service.ts` - PostgreSQL service for user and wallet management
- `apps/api-gateway/src/database/database.module.ts` - Database module (global)

### Auth Module
- `apps/api-gateway/src/modules/auth/auth.module.ts` - Auth module
- `apps/api-gateway/src/modules/auth/auth.service.ts` - Authentication business logic
- `apps/api-gateway/src/modules/auth/auth.controller.ts` - Auth endpoints
- `apps/api-gateway/src/modules/auth/google.strategy.ts` - Passport Google OAuth strategy
- `apps/api-gateway/src/modules/auth/auth.guard.ts` - Session-based auth guard

### Configuration
- `apps/api-gateway/src/types/fastify.d.ts` - TypeScript session type definitions
- `apps/api-gateway/.env.example` - Environment variables template

### Modified Files
- `apps/api-gateway/src/main.ts` - Added cookie and session middleware
- `apps/api-gateway/src/app.module.ts` - Imported DatabaseModule and AuthModule
- `packages/shared-config/src/env.ts` - Added Google OAuth and session env vars

## Database Schema

Auto-created on startup:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  google_sub VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallet accounts table
CREATE TABLE wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  locked_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, currency)
);
```

## API Endpoints

### 1. `GET /v1/auth/google`
Initiates Google OAuth flow. Redirects to Google's consent page.

**Usage:**
```html
<a href="http://localhost:3000/v1/auth/google">Sign in with Google</a>
```

### 2. `GET /v1/auth/google/callback`
Google OAuth callback. Handles authentication and redirects.

**Flow:**
1. Google redirects here after user consent
2. Creates/finds user by Google sub or email
3. Creates wallet if doesn't exist
4. Sets session cookie with userId
5. Redirects to `AUTH_SUCCESS_REDIRECT` (e.g., `http://localhost:3001/app`)

### 3. `GET /v1/auth/me`
Returns current authenticated user.

**Request:**
```bash
curl http://localhost:3000/v1/auth/me \
  -H "Cookie: sessionId=<cookie-from-browser>"
```

**Response (authenticated):**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "https://..."
  }
}
```

**Response (not authenticated):**
```json
{
  "authenticated": false
}
```

### 4. `POST /v1/auth/logout`
Destroys session and logs out user.

**Request:**
```bash
curl -X POST http://localhost:3000/v1/auth/logout \
  -H "Cookie: sessionId=<cookie-from-browser>"
```

**Response:**
```json
{
  "success": true
}
```

## Environment Variables

Add to `apps/api-gateway/.env`:

```bash
# Google OAuth - Get from https://console.cloud.google.com/
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/v1/auth/google/callback

# Auth Redirects
AUTH_SUCCESS_REDIRECT=http://localhost:3001/app
AUTH_FAILURE_REDIRECT=http://localhost:3001/auth/login

# Session Secret (generate a secure random string)
SESSION_SECRET=your-super-secret-session-key-min-32-chars-long

# Database (should already exist)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betting_exchange
```

## Setup Google OAuth

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add authorized redirect URI:
   ```
   http://localhost:3000/v1/auth/google/callback
   ```
7. Copy the **Client ID** and **Client Secret**

### Step 2: Configure Environment

Create `.env` file in `apps/api-gateway/`:

```bash
cp .env.example .env
```

Update with your Google credentials:
```bash
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
```

### Step 3: Build and Run

```bash
# From project root
cd apps/api-gateway
pnpm install
pnpm run build

# Start API Gateway
pnpm start
```

Or with environment variables:
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betting_exchange
export GOOGLE_CLIENT_ID=your-id
export GOOGLE_CLIENT_SECRET=your-secret
export SESSION_SECRET=your-session-secret

node dist/main.js
```

## Testing

### Test 1: Health Check (existing endpoints still work)

```bash
curl http://localhost:3000/v1/markets
```

Should return markets data as before.

### Test 2: Browser Test (Full OAuth Flow)

1. Open browser to: `http://localhost:3000/v1/auth/google`
2. You'll be redirected to Google's consent page
3. Sign in with your Google account
4. Grant permissions
5. You'll be redirected to `http://localhost:3001/app` (or your configured URL)
6. Session cookie will be set automatically

### Test 3: Check Authentication

After logging in, test the `/me` endpoint:

```bash
# Replace <cookie> with the session cookie from your browser
curl http://localhost:3000/v1/auth/me \
  -H "Cookie: sessionId=<your-session-cookie>" \
  -v
```

Should return your user profile.

### Test 4: Logout

```bash
curl -X POST http://localhost:3000/v1/auth/logout \
  -H "Cookie: sessionId=<your-session-cookie>"
```

Should return `{"success": true}`.

### Test 5: Verify Database

Check that user and wallet were created:

```bash
docker exec -it cggamefix-postgres-1 psql -U postgres -d betting_exchange

# Inside psql:
SELECT * FROM users;
SELECT * FROM wallet_accounts;
```

## Frontend Integration

### Update Login Page

Update `apps/web/app/routes/auth.login.tsx`:

```tsx
export default function Login() {
  return (
    <div>
      <h1>Sign In</h1>
      <a
        href="http://localhost:3000/v1/auth/google"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#4285f4',
          color: 'white',
          borderRadius: '4px',
          textDecoration: 'none',
        }}
      >
        <img 
          src="https://www.google.com/favicon.ico" 
          alt="Google" 
          style={{ width: 20, marginRight: 8 }} 
        />
        Sign in with Google
      </a>
    </div>
  );
}
```

### Check Auth Status

Update frontend to check `/v1/auth/me`:

```typescript
// apps/web/app/lib/api.server.ts
export async function getCurrentUser() {
  const res = await fetch('http://localhost:3000/v1/auth/me', {
    credentials: 'include', // Important: send cookies
  });
  return res.json();
}
```

Use in loaders:

```typescript
// apps/web/app/routes/app._layout.tsx
export async function loader() {
  const auth = await getCurrentUser();
  if (!auth.authenticated) {
    throw redirect('/auth/login');
  }
  return json({ user: auth.user });
}
```

### Logout

```typescript
export async function logout() {
  await fetch('http://localhost:3000/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
```

## Session Configuration

Sessions are configured with:
- **Cookie name**: `sessionId` (default)
- **Max age**: 24 hours
- **HttpOnly**: true (prevents XSS)
- **Secure**: true in production (requires HTTPS)
- **SameSite**: lax (prevents CSRF)

## Security Notes

1. **SESSION_SECRET**: Must be at least 32 characters. Generate with:
   ```bash
   openssl rand -base64 32
   ```

2. **Production**: Set `NODE_ENV=production` to enable secure cookies (requires HTTPS)

3. **CORS**: Configured to allow credentials from frontend origin

4. **Database**: Tables are auto-created on startup. For production, use proper migrations.

## Troubleshooting

### Issue: "Invalid redirect_uri"
**Solution**: Add exact callback URL to Google Cloud Console authorized redirect URIs.

### Issue: Session not persisting
**Solution**: 
- Check that cookies are enabled in browser
- Verify CORS credentials are enabled
- Check that frontend sends `credentials: 'include'`

### Issue: Database connection error
**Solution**: Verify `DATABASE_URL` is correct and PostgreSQL is running:
```bash
docker compose up -d
```

### Issue: TypeScript errors
**Solution**: Rebuild the project:
```bash
cd apps/api-gateway
pnpm run build
```

## Next Steps

1. **Add more auth providers**: Facebook, GitHub, etc.
2. **Add JWT tokens**: For API-only clients
3. **Add refresh tokens**: For long-lived sessions
4. **Add user profile management**: Update name, avatar, etc.
5. **Add email verification**: Verify user email addresses
6. **Add 2FA**: Two-factor authentication

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. GET /v1/auth/google
       ▼
┌─────────────────────────────────┐
│  API Gateway (NestJS + Fastify) │
│  - GoogleStrategy               │
└──────┬──────────────────────────┘
       │ 2. Redirect to Google
       ▼
┌─────────────┐
│   Google    │ 3. User signs in
│   OAuth     │
└──────┬──────┘
       │ 4. Callback with code
       ▼
┌─────────────────────────────────┐
│  API Gateway                    │
│  - AuthService.handleGoogleLogin│
│  - DatabaseService              │
└──────┬──────────────────────────┘
       │ 5. Find/create user + wallet
       ▼
┌─────────────┐
│  PostgreSQL │
│  - users    │
│  - wallets  │
└─────────────┘
       │ 6. Set session cookie
       ▼
┌─────────────┐
│   Browser   │ Redirected to app
└─────────────┘
```

## Summary

✅ Google OAuth fully implemented
✅ Session-based authentication
✅ User registration with auto-wallet creation
✅ Protected routes with AuthGuard
✅ Database service with PostgreSQL
✅ Existing routes preserved
✅ TypeScript type safety
✅ Production-ready session config
