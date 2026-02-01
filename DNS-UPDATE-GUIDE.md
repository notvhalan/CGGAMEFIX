# DNS Update Guide - After Each Deployment

Every time you deploy (push to GitHub), the ECS task gets a new IP address.

## What You Need to Update:

**Only 1 Place: Cloudflare DNS A Record**

## Manual Method (Takes 2 minutes):

1. **Get the new IP**:
   ```powershell
   # Run this in terminal:
   $taskArn = aws ecs list-tasks --region us-east-1 --cluster betting-exchange-hybrid --service-name web-frontend --query 'taskArns[0]' --output text
   $taskDetails = aws ecs describe-tasks --region us-east-1 --cluster betting-exchange-hybrid --tasks $taskArn | ConvertFrom-Json
   $eniId = ($taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
   aws ec2 describe-network-interfaces --region us-east-1 --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text
   ```

2. **Update Cloudflare**:
   - Go to: https://dash.cloudflare.com/
   - Click: `gamefix.fun` → **DNS** → **Records**
   - Find the `@` (root) **A record**
   - Click **Edit**
   - Change **IPv4 address** to the new IP from step 1
   - Click **Save**

3. **Done!** Your site works at `http://gamefix.fun:3001`

---

## Automated Method (Takes 10 seconds):

### First-Time Setup:

1. **Get Cloudflare API Token**:
   - Go to: https://dash.cloudflare.com/profile/api-tokens
   - Click: **Create Token**
   - Use: **Edit zone DNS** template
   - Zone Resources: `gamefix.fun`
   - Click: **Continue to summary** → **Create Token**
   - **Copy the token** (you can't see it again!)

2. **Get Cloudflare Zone ID**:
   - Go to: https://dash.cloudflare.com/
   - Click: `gamefix.fun`
   - Scroll down on the **Overview** page
   - Find **Zone ID** in the right sidebar (under API section)
   - Copy it

3. **Edit the script**:
   - Open: `update-dns-after-deploy.ps1`
   - Paste your API token in line 4: `$CLOUDFLARE_API_TOKEN = "your_token_here"`
   - Paste your Zone ID in line 5: `$CLOUDFLARE_ZONE_ID = "your_zone_id_here"`
   - Save the file

### After Each Deployment:

```powershell
.\update-dns-after-deploy.ps1
```

**That's it!** DNS updates automatically in 2 seconds.

---

## What Gets Updated:

- ✅ **Root domain** (`@`): Points to new IP
- ✅ **www subdomain**: Automatically follows (it's a CNAME to root)

## What Does NOT Need Updating:

- ❌ Backend configuration (runs locally)
- ❌ Environment variables in ECS (stay the same)
- ❌ Docker image (already has new code)
- ❌ Any other AWS resources

---

## Deployment Workflow Summary:

```
1. Push code to GitHub
   ↓
2. GitHub Actions builds & deploys to ECS
   ↓
3. ECS starts new task with NEW IP
   ↓
4. Run: .\update-dns-after-deploy.ps1
   ↓
5. DNS updated → Site live at gamefix.fun:3001
```

---

## Future: Eliminate This Step

To never update DNS again, add an **Application Load Balancer** (~$16/month):
- Gets permanent DNS name
- Point gamefix.fun to it once
- Works forever, no updates needed

Let me know if you want to set that up!
