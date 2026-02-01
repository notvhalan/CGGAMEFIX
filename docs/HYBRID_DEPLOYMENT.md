# Hybrid Deployment: AWS Frontend + Local Backend

**Cost: ~$1-3/month** (only for hosting static website)

This approach hosts only the web frontend on AWS while running all backend services on your local machine.

## Architecture

```
┌─────────────────────────────────────┐
│         AWS (Cloud)                 │
│  ┌──────────────────────────────┐  │
│  │  S3 + CloudFront             │  │
│  │  (Static Website)            │  │
│  │  Cost: ~$1-2/month           │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
                 ↓ HTTPS
┌─────────────────────────────────────┐
│      Cloudflare Tunnel / ngrok      │
│      (Exposes local API)            │
│      Cost: Free                     │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│    Your Local Machine               │
│  ┌──────────────────────────────┐  │
│  │  Docker Compose:             │  │
│  │  - PostgreSQL                │  │
│  │  - Redis                     │  │
│  │  - NATS                      │  │
│  │  - API Gateway (port 3000)   │  │
│  │  - Matching Engine           │  │
│  │  - Wallet Service            │  │
│  │  - All other services        │  │
│  │  Cost: $0 (your electricity) │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Benefits

✅ **Ultra-low cost**: Only ~$1-3/month for static hosting  
✅ **Full control**: All data stays on your machine  
✅ **Easy debugging**: Direct access to logs and databases  
✅ **Fast development**: No deployment delays  
✅ **No database costs**: Use local PostgreSQL/Redis

## Drawbacks

⚠️ **Local machine must be running 24/7** for users to access  
⚠️ **Your IP address might change** (use dynamic DNS or tunnel)  
⚠️ **Limited scalability**: Depends on your machine's resources  
⚠️ **Potential security risks**: Exposing local services to internet

## Setup Steps

### 1. Expose Local API to Internet

**Option A: Cloudflare Tunnel (Recommended - Free & Secure)**

```bash
# Install cloudflared
# Windows: Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
# Mac: brew install cloudflare/cloudflare/cloudflared
# Linux: wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# Login to Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create betting-exchange

# Configure tunnel (creates config.yml)
cloudflared tunnel route dns betting-exchange api.yourdomain.com

# Run tunnel
cloudflared tunnel run betting-exchange
```

**Option B: ngrok (Easier but paid for custom domain)**

```bash
# Install ngrok: https://ngrok.com/download

# Sign up and get auth token
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Expose local API
ngrok http 3000

# For custom domain (paid): ngrok http 3000 --domain=api.yourdomain.com
```

**Option C: Port Forwarding (Free but requires router access)**

1. Configure router to forward port 3000 to your local machine
2. Use Dynamic DNS service (DuckDNS, No-IP) for changing IP
3. Set up HTTPS with Let's Encrypt

### 2. Build Frontend for Production

```bash
# Update API URL to point to your exposed tunnel
cd apps/web

# Build with production API URL
VITE_API_URL=https://api.yourdomain.com \
VITE_WS_URL=wss://api.yourdomain.com \
npm run build

# Output will be in apps/web/build/
```

### 3. Deploy Frontend to AWS S3

**Create S3 bucket and upload:**

```bash
# Create S3 bucket
aws s3 mb s3://your-betting-exchange-frontend

# Enable static website hosting
aws s3 website s3://your-betting-exchange-frontend \
  --index-document index.html \
  --error-document index.html

# Upload build files
aws s3 sync apps/web/build/ s3://your-betting-exchange-frontend

# Make bucket public
aws s3api put-bucket-policy \
  --bucket your-betting-exchange-frontend \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-betting-exchange-frontend/*"
    }]
  }'
```

### 4. Add CloudFront CDN (Optional but recommended)

```bash
# Create CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name your-betting-exchange-frontend.s3-website-us-east-1.amazonaws.com \
  --default-root-object index.html
```

### 5. Run Backend Services Locally

```bash
# Start all infrastructure
make docker-up

# Start all backend services
make dev

# Your API should now be running on localhost:3000
# And accessible via your tunnel at https://api.yourdomain.com
```

## Production Configuration

### Enable CORS in API Gateway

```typescript
// apps/api-gateway/src/main.ts
app.enableCors({
  origin: [
    'http://localhost:5173',
    'https://your-betting-exchange-frontend.s3-website-us-east-1.amazonaws.com',
    'https://yourdomain.com', // Your CloudFront domain
  ],
  credentials: true,
});
```

### Environment Variables

```bash
# .env.hybrid (for local backend with cloud frontend)
NODE_ENV=production

# Local infrastructure
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betting_exchange
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222

# API exposed via tunnel
API_PUBLIC_URL=https://api.yourdomain.com

# Frontend hosted on AWS
FRONTEND_URL=https://yourdomain.com

# CORS origins
CORS_ORIGINS=https://yourdomain.com,https://your-betting-exchange-frontend.s3-website-us-east-1.amazonaws.com
```

## Cost Breakdown

### AWS Costs (Monthly)
- S3 Storage (1GB): $0.023
- S3 Requests (10k): $0.005
- CloudFront (10GB transfer): $0.85
- **Total: ~$1-2/month**

### Local Costs
- Electricity: ~$5-15/month (depends on PC power consumption)
- Internet: Already paying
- **Total: $5-15/month**

### Tunnel/Proxy Costs
- Cloudflare Tunnel: **Free**
- ngrok Free: **Free** (with random URLs)
- ngrok Paid: $8/month (custom domain)

**Grand Total: $1-17/month** (depending on choices)

## Automation

### Keep Backend Running 24/7

**Windows (Task Scheduler):**
```batch
# Create start-services.bat
@echo off
cd C:\Users\vhalan\Desktop\CGGAMEFIX
docker-compose up -d
pnpm run dev
```

**Linux/Mac (systemd service):**
```bash
# Create /etc/systemd/system/betting-exchange.service
[Unit]
Description=Betting Exchange Backend
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/CGGAMEFIX
ExecStart=/usr/local/bin/pnpm run dev
Restart=always

[Install]
WantedBy=multi-user.target
```

### Auto-deploy Frontend on Changes

```bash
# deploy-frontend.sh
#!/bin/bash
cd apps/web
npm run build
aws s3 sync build/ s3://your-betting-exchange-frontend --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## Security Considerations

1. **Use HTTPS**: Always use Cloudflare Tunnel or ngrok for SSL
2. **Firewall rules**: Only expose necessary ports
3. **Rate limiting**: Add rate limiting to API
4. **Authentication**: Ensure JWT tokens are properly validated
5. **Keep services updated**: Regular security patches
6. **Backup data**: Regular database backups

## When to Upgrade

This setup works great until:
- You get more than 100 concurrent users
- You need 99.9% uptime guarantees
- Your local internet becomes unreliable
- You travel or need to turn off your PC

Then migrate to full AWS hosting.

## Monitoring

### Check if Backend is Accessible

```bash
# Test from outside your network
curl https://api.yourdomain.com/health

# Monitor tunnel status
cloudflared tunnel info betting-exchange
```

### Check Frontend

```bash
# Test S3 website
curl https://your-betting-exchange-frontend.s3-website-us-east-1.amazonaws.com

# Test CloudFront
curl https://yourdomain.com
```
