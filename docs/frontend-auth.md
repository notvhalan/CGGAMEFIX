# Frontend Google OAuth Integration - Testing Guide

## Changes Made

### 1. Auth Helper (`app/lib/auth.server.ts`)
- `getAuthenticatedUser(request)` - Fetches user from backend `/v1/auth/me` with cookies
- `requireUser(request)` - Requires authentication or redirects to `/auth/login`
- `logout(request)` - Calls backend `/v1/auth/logout`

### 2. Login Page (`app/routes/auth.login.tsx`)
- Removed email/password form
- Added "Continue with Google" button linking to `${API_BASE_URL}/v1/auth/google`
- Includes Google logo SVG
- Shows explanation text about redirect flow

### 3. App Layout (`app/routes/app._layout.tsx`)
- Added `loader` that calls `requireUser(request)`
- Protected all `/app/*` routes - redirects to login if not authenticated
- Added user profile display in sidebar:
  - Shows avatar (or initial if no avatar)
  - Shows name and email
  - Includes logout button

### 4. Logout Route (`app/routes/auth.logout.tsx`)
- Action that calls backend logout endpoint
- Redirects to `/` after logout

## Environment Variables

Ensure `apps/web/.env` has:

```bash
API_BASE_URL=http://localhost:3000
WS_URL=ws://localhost:3000
```

## Testing Steps

### 1. Start Both Services

**Terminal 1 - API Gateway:**
```bash
cd apps/api-gateway
# Make sure .env has Google OAuth credentials
node dist/main.js
```

**Terminal 2 - Web Frontend:**
```bash
cd apps/web
pnpm run dev
```

### 2. Test Login Flow

1. Navigate to: `http://localhost:3001/auth/login`
2. Click "Continue with Google"
3. Browser redirects to Google OAuth consent page
4. Sign in with Google account
5. Google redirects to: `http://localhost:3000/v1/auth/google/callback`
6. Backend creates user & wallet, sets session cookie
7. Backend redirects to: `http://localhost:3001/app`
8. Frontend should show dashboard with user info in sidebar

### 3. Test Protected Routes

Try accessing `/app` routes directly:
- **Logged in**: Should see content
- **Not logged in**: Should redirect to `/auth/login`

### 4. Test User Display

Check sidebar shows:
- User avatar (or initial)
- User name
- User email
- Logout button

### 5. Test Logout

1. Click "Log Out" button in sidebar
2. Should redirect to homepage (`/`)
3. Session cookie should be cleared
4. Trying to access `/app` should redirect to `/auth/login`

## Cookie Flow

```
Browser → Login Page → Click Google Button
  ↓
Google OAuth Consent
  ↓
Backend /v1/auth/google/callback
  - Creates/finds user
  - Sets session cookie (sessionId)
  - Redirects to /app
  ↓
Frontend /app → loader calls requireUser
  - Fetches /v1/auth/me with cookie
  - Returns user data
  - Renders protected page
```

## Troubleshooting

### Issue: Redirects to /auth/login immediately after Google sign-in

**Cause**: Cookies not being forwarded properly

**Solution**:
1. Check CORS settings in API Gateway allow credentials
2. Ensure `credentials: 'include'` in fetch calls
3. Verify cookie domain matches (both localhost)

### Issue: User data not showing in sidebar

**Cause**: Loader not fetching user or user data incomplete

**Solution**:
1. Check Network tab in browser DevTools
2. Verify `/v1/auth/me` returns user data
3. Check console for any errors

### Issue: Google OAuth returns error

**Cause**: Missing or incorrect Google credentials

**Solution**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in API Gateway `.env`
2. Check redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/v1/auth/google/callback`

### Issue: Session expires too quickly

**Cause**: Default 24-hour session timeout

**Solution**: Adjust `maxAge` in `apps/api-gateway/src/main.ts` session config

## API Endpoints Used

### Backend (API Gateway)
- `GET /v1/auth/google` - Initiates OAuth flow
- `GET /v1/auth/google/callback` - OAuth callback
- `GET /v1/auth/me` - Get current user
- `POST /v1/auth/logout` - Destroy session

### Frontend
- `GET /auth/login` - Login page
- `GET /app/*` - Protected routes (require authentication)
- `POST /auth/logout` - Logout action

## Session Management

**Storage**: Server-side session stored in memory (configurable)
**Cookie**: `sessionId` HttpOnly cookie
**Expiry**: 24 hours (rolling)
**Security**: 
- HttpOnly: Prevents XSS
- Secure: HTTPS only in production
- SameSite: Lax (prevents CSRF)

## Next Steps

1. **Add loading states**: Show spinner during authentication
2. **Error handling**: Display errors if auth fails
3. **Remember me**: Add option for longer session
4. **Profile page**: Allow users to edit profile
5. **Multiple providers**: Add GitHub, Facebook, etc.
6. **Session store**: Use Redis for production
7. **Rate limiting**: Prevent auth abuse
