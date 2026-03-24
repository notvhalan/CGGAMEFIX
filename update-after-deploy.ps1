# After deploying to ECS, this script:
# 1. Gets the new ECS task public IP
# 2. Updates the Cloudflare Tunnel config to route gamefix.fun → new IP
# 3. Restarts cloudflared to pick up the change
#
# gamefix.fun is routed through a Cloudflare Tunnel (CNAME), so HTTPS is automatic.
# No DNS changes needed — just update the tunnel's ingress config.

$CLUSTER = "betting-exchange-hybrid"
$SERVICE = "web-frontend"
$REGION = "us-east-1"
$CONFIG_PATH = "$env:USERPROFILE\.cloudflared\config.yml"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Update Tunnel After ECS Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Get current ECS task IP
Write-Host "`n[1/3] Getting ECS task IP..." -ForegroundColor Yellow
$taskArn = aws ecs list-tasks --region $REGION --cluster $CLUSTER --service-name $SERVICE --query 'taskArns[0]' --output text

if (-not $taskArn -or $taskArn -eq "None") {
    Write-Host "ERROR: No running tasks found for $SERVICE in $CLUSTER" -ForegroundColor Red
    exit 1
}

$taskDetails = aws ecs describe-tasks --region $REGION --cluster $CLUSTER --tasks $taskArn | ConvertFrom-Json
$eniId = ($taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
$newIP = aws ec2 describe-network-interfaces --region $REGION --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text

if (-not $newIP -or $newIP -eq "None") {
    Write-Host "ERROR: Could not get public IP for task" -ForegroundColor Red
    exit 1
}

Write-Host "  ECS IP: $newIP" -ForegroundColor Green

# Step 2: Update tunnel config
Write-Host "`n[2/3] Updating tunnel config..." -ForegroundColor Yellow

$config = Get-Content $CONFIG_PATH -Raw

# Replace the gamefix.fun and www.gamefix.fun service URLs with the new IP
$config = $config -replace '(- hostname: gamefix\.fun\s+service: http://)[\d\.]+:(\d+)', "`${1}${newIP}:`${2}"
$config = $config -replace '(- hostname: www\.gamefix\.fun\s+service: http://)[\d\.]+:(\d+)', "`${1}${newIP}:`${2}"

$config | Set-Content $CONFIG_PATH -NoNewline

Write-Host "  Updated $CONFIG_PATH" -ForegroundColor Green

# Show the updated routes
Write-Host "`n  Current ingress routes:" -ForegroundColor Gray
Get-Content $CONFIG_PATH | Select-String "hostname|service" | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }

# Step 3: Restart cloudflared
Write-Host "`n[3/3] Restarting cloudflared tunnel..." -ForegroundColor Yellow

$service = Get-Service -Name "cloudflared*" -ErrorAction SilentlyContinue
if ($service) {
    Restart-Service -Name $service.Name -Force
    Write-Host "  Restarted cloudflared Windows service" -ForegroundColor Green
} else {
    # Try stopping any running cloudflared process and restarting
    $proc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  Cloudflared running as process (not service). Restart manually:" -ForegroundColor Yellow
        Write-Host "  1. Stop: taskkill /IM cloudflared.exe /F" -ForegroundColor Cyan
        Write-Host "  2. Start: cloudflared tunnel run betting-exchange-api" -ForegroundColor Cyan
    } else {
        Write-Host "  WARNING: cloudflared not running. Start it with:" -ForegroundColor Yellow
        Write-Host "  cloudflared tunnel run betting-exchange-api" -ForegroundColor Cyan
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Done!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`ngamefix.fun → http://$newIP`:3001 (via Cloudflare Tunnel → HTTPS)" -ForegroundColor Cyan
Write-Host "Site will be live at https://gamefix.fun in ~30 seconds" -ForegroundColor Green
