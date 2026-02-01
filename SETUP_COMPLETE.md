# Hybrid Deployment Setup Complete! 🎉

Your frontend Docker image is now on AWS!

## ✅ What's Done:

1. **ECR Repository Created**: `474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid`
2. **Frontend Docker Image Built & Pushed**: Ready to deploy
3. **ECS Cluster Created**: `betting-exchange-hybrid`

## 📋 Next Steps:

### Step 1: Create ECS Task & Service (AWS Console)

**Go to AWS ECS Console**: https://console.aws.amazon.com/ecs/

1. **Navigate to**: Task Definitions → Create new task definition
   - **Family name**: `web-frontend-hybrid`
   - **Launch type**: Fargate
   - **Task role**: None (or create ecsTaskRole)
   - **Task execution role**: ecsTaskExecutionRole (should exist)
   
2. **Task size**:
   - **CPU**: 0.25 vCPU (256)
   - **Memory**: 0.5 GB (512)
   
3. **Container**:
   - **Name**: `web-frontend`
   - **Image**: `474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid:latest`
   - **Port mappings**: `3001` (TCP)
   - **Environment variables**:
     ```
     NODE_ENV=production
     VITE_API_URL=https://api.gamefix.fun
     VITE_WS_URL=wss://api.gamefix.fun
     PORT=3001
     ```
   
4. **Click**: Create

5. **Create Service**:
   - **Cluster**: `betting-exchange-hybrid`
   - **Launch type**: Fargate
   - **Task definition**: `web-frontend-hybrid:latest`
   - **Service name**: `web-frontend`
   - **Number of tasks**: 1
   - **Deployment**: Rolling update
   - **VPC**: Default VPC
   - **Subnets**: Select all available
   - **Security group**: Create new
     - Allow inbound: TCP 3001 from anywhere (0.0.0.0/0)
   - **Auto-assign public IP**: ENABLED
   - **Click**: Create Service

### Step 2: ✅ Get the Public IP

**Your Public IP**: `34.204.86.104`

You can test it now:
```powershell
# Test direct IP access (might show error page, that's okay)
curl http://34.204.86.104:3001
```

### Step 3: Configure Cloudflare DNS

**Go to Cloudflare Dashboard**: https://dash.cloudflare.com/

**Navigate to**: Your domain `gamefix.fun` → DNS → Records

#### Option A: Quick Setup (Just add root A record)

1. **Add A record for root domain**:
   - Type: `A`
   - Name: `@` (or leave empty)
   - IPv4 address: `34.204.86.104`
   - Proxy status: **Proxied** (orange cloud) - Turn ON for free SSL/CDN
   - TTL: Auto
   - Click **Save**

2. **Keep the existing www CNAME** - it's already correct!

**⚠️ IMPORTANT: Transfer Nameservers to Cloudflare**

Your domain is still using GoDaddy nameservers. To get full Cloudflare functionality:

**In Cloudflare Dashboard** → `gamefix.fun` → Overview:
- Look for "Cloudflare Nameservers" section
- Copy the 2 nameservers (e.g., `bella.ns.cloudflare.com`, `chad.ns.cloudflare.com`)

**In GoDaddy** (https://dcc.godaddy.com/):
- Go to My Products → gamefix.fun → DNS → Nameservers
- Click **Change Nameservers**
- Select "I'll use my own nameservers"
- Paste the 2 Cloudflare nameservers
- Click **Save**

**Wait 5-60 minutes** for nameserver propagation, then test: https://gamefix.fun

### Step 4: Setup Cloudflare Tunnel for Backend

**Go to Cloudflare Dashboard**: https://dash.cloudflare.com/

**Navigate to**: Zero Trust → Access → Tunnels → **betting-exchange-api**

1. **Click "Configure"** on your tunnel

2. **Go to "Public Hostname" tab**

3. **Click "Add a public hostname"**:
   - Subdomain: `api`
   - Domain: `gamefix.fun`
   - Path: (leave empty)
   - Type: `HTTP`
   - URL: `localhost:3000`
   - Click **Save**

4. **Run the tunnel on your local machine**:
   ```powershell
**Open ANOTHER new terminal** and run:

```powershell
# Make sure you're in the project directory
cd C:\Users\vhalan\Desktop\CGGAMEFIX

# Start Docker infrastructure (PostgreSQL, Redis, NATS)
docker-compose up -d

# Wait 5 seconds for services to start
Start-Sleep -Seconds 5

# Start backend services
pnpm run dev
```

You should see all services starting:
- API Gateway on http://localhost:3000
- Matching Engine
- Market Data
- Settlement Service
- Wallet Service

### Step 6: Test Everything!

1. **Frontend (Direct IP)**: http://34.204.86.104:3001
2. **Frontend (Domain)**: http://gamefix.fun (after DNS propagates)
3. **API via Tunnel**: https://api.gamefix.fun/health
4. **Full app**: https://gamefix.fun - Should work end-to-end!

**Verify each:**
```powershell
# Test frontend direct
curl http://34.204.86.104:3001

# Test API via tunnel (should show "OK" or health status)
curl https://api.gamefix.fun/health

# Test frontend via domain
curl http://gamefix.fun
```

# Start backend services
pnpm run dev:gateway
pnpm run dev:engine
# ... or just: pnpm run dev
```

### Step 6: Test Everything!

1. **Frontend**: Visit https://gamefix.fun
2. **API**: Visit https://api.gamefix.fun/health
3. **Full app**: Should work end-to-end!

---

## 💰 Monthly Costs:

- **Frontend on ECS Fargate Spot**: ~$3-5/month
- **Backend via Cloudflare Tunnel**: **FREE**
- **Total**: **~$3-5/month** 🎉

---

## 🔄 Future Deployments:

To update the frontend:

```powershell
.\deploy-frontend.ps1
```

Then in AWS Console:
- Go to ECS → Clusters → betting-exchange-hybrid → Services → web-frontend
- Click "Update Service" → Check "Force new deployment" → Update

---

## 🐛 Troubleshooting:

**Frontend not loading?**
- Check ECS service is running
- Check security group allows port 3001
- Verify DNS points to correct IP

**API not working?**
- Check Cloudflare tunnel is running
- Check backend services are running locally
- Check CORS is configured correctly

**Need to restart?**
```powershell
# Stop tunnel: Ctrl+C in tunnel terminal
# Stop backend: Ctrl+C in dev terminal
# Stop ECS service: AWS Console → Stop Service
```

---

## 📝 Summary:

You now have:
- ✅ Frontend hosted on AWS ECS ($3-5/month)
- ✅ Backend running locally (FREE via Cloudflare Tunnel)  
- ✅ Custom domain (gamefix.fun) ready to configure
- ✅ Professional setup with minimal cost!

**Need help with any step? Let me know!**
