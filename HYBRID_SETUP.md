# Hybrid Deployment: AWS Frontend + Local Backend

Cost: **~$1-3/month**

## Quick Setup

### 1. Setup Cloudflare Tunnel (Free)

```bash
# Install cloudflared
# Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create betting-exchange

# Create config file: ~/.cloudflared/config.yml
tunnel: YOUR_TUNNEL_ID
credentials-file: /path/to/YOUR_TUNNEL_ID.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Run tunnel:**
```bash
cloudflared tunnel run betting-exchange
```

### 2. Deploy Frontend to AWS

```bash
# Set variables
export S3_BUCKET_NAME=your-betting-exchange-frontend
export API_URL=https://api.yourdomain.com

# Build and deploy
chmod +x scripts/deploy-hybrid.sh
./scripts/deploy-hybrid.sh
```

### 3. Run Backend Locally

```bash
# Start infrastructure
make docker-up

# Start all services
make dev

# Backend now running on localhost:3000
# Accessible via tunnel at https://api.yourdomain.com
```

## Alternative: Use ngrok (Easier but Limited)

```bash
# Install ngrok: https://ngrok.com/download

# Run tunnel
ngrok http 3000

# Use the generated URL (e.g., https://abc123.ngrok.io) as your API_URL
```

## Cost Comparison

| Setup | Monthly Cost |
|-------|-------------|
| **Hybrid (S3 + Local)** | $1-3 |
| Mock Data on ECS | $5-7 |
| Full AWS (Minimal) | $50-100 |
| Full AWS (Production) | $200-500 |

## When to Use This

✅ Development/Testing  
✅ Personal projects  
✅ Low traffic demos  
✅ When you have reliable internet  
✅ Want to save money

❌ Production with many users  
❌ Need 99.9% uptime  
❌ Can't keep computer running  
❌ Travel frequently

## Troubleshooting

**Frontend can't reach API:**
- Check tunnel is running
- Verify CORS_ORIGINS includes your S3 URL
- Check API_PUBLIC_URL in .env.hybrid

**502 Bad Gateway:**
- Ensure backend services are running
- Check Docker containers: `docker ps`
- Check logs: `docker-compose logs`

**CORS errors:**
- Update CORS_ORIGINS in backend
- Clear CloudFront cache
- Check browser console for details
