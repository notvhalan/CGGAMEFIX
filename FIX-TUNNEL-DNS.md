# Fix Cloudflare Tunnel DNS

## Problem
- Backend running on localhost:3000 ✅
- Cloudflare Tunnel running with 4 connections ✅
- DNS for `api.gamefix.fun` NOT resolving ❌

## Root Cause
The tunnel configuration file (`config.yml`) has the hostname, but you need to **add it as a Public Hostname in Cloudflare Zero Trust dashboard** to create the DNS record automatically.

## Solution - Add Public Hostname in Cloudflare

### Step 1: Go to Cloudflare Zero Trust
1. Open https://one.dash.cloudflare.com/
2. Login to your Cloudflare account
3. Go to **Networks** → **Tunnels**

### Step 2: Configure Tunnel
1. Find your tunnel: **betting-exchange-api** (ID: 67b4921d-75b0-49c5-95e0-e47c9e9e3e1b)
2. Click **Configure** button
3. Go to **Public Hostname** tab

### Step 3: Add Public Hostname
Click **Add a public hostname** and enter:

- **Subdomain**: `api`
- **Domain**: `gamefix.fun`
- **Type**: HTTP
- **URL**: `localhost:3000`

Click **Save hostname**

### Step 4: Verify DNS (takes 1-5 minutes)
```powershell
# Test DNS resolution
nslookup api.gamefix.fun

# Test the endpoint
curl https://api.gamefix.fun/v1/markets
```

## Alternative: Manual DNS Record
If the automatic DNS doesn't work, manually add DNS:

1. Go to https://dash.cloudflare.com/
2. Select domain **gamefix.fun**
3. Go to **DNS** → **Records**
4. Click **Add record**:
   - **Type**: CNAME
   - **Name**: api
   - **Target**: `67b4921d-75b0-49c5-95e0-e47c9e9e3e1b.cfargotunnel.com`
   - **Proxy status**: Proxied (orange cloud)
   - **TTL**: Auto
5. Click **Save**

## Expected Result
After adding the hostname:
```powershell
# DNS should resolve to Cloudflare IPs
PS> nslookup api.gamefix.fun
Name:    api.gamefix.fun
Addresses: 104.26.x.x
          172.67.x.x

# Backend should be accessible
PS> curl https://api.gamefix.fun/v1/markets
StatusCode: 200
```

## Troubleshooting

### If DNS still doesn't resolve after 5 minutes:
1. Check nameservers are pointing to Cloudflare:
   ```powershell
   nslookup -type=NS gamefix.fun
   ```
   Should show: `*.ns.cloudflare.com`

2. Verify tunnel is still running:
   ```powershell
   Get-Process -Name cloudflared
   ```

3. Check tunnel logs in the terminal to ensure no errors

### If you get SSL certificate errors:
- Cloudflare automatically provisions SSL certificates
- Wait 5-10 minutes for SSL to propagate
- You can temporarily use `curl -k` to bypass certificate validation

## Next Steps After DNS Works
1. Test backend: `curl https://api.gamefix.fun/v1/markets`
2. Update Google OAuth callback URL to: `https://api.gamefix.fun/v1/auth/google/callback`
3. Test auth flow from phone at `http://gamefix.fun:3001`
