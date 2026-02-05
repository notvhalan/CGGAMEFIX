# Cloudflare Tunnel Setup for GameFix
# This script helps set up Cloudflare Tunnel to expose your AWS ECS service

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cloudflare Tunnel Setup for GameFix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Configuration
$TUNNEL_NAME = "gamefix-hybrid"
$DOMAIN = "gamefix.fun"

Write-Host "`nStep 1: Install cloudflared (if not already installed)" -ForegroundColor Yellow
Write-Host "Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" -ForegroundColor Cyan
Write-Host "Or run: winget install Cloudflare.cloudflared" -ForegroundColor Cyan
Write-Host "`nPress Enter when cloudflared is installed..."
Read-Host

Write-Host "`nStep 2: Authenticate with Cloudflare" -ForegroundColor Yellow
cloudflared tunnel login

Write-Host "`nStep 3: Create tunnel" -ForegroundColor Yellow
cloudflared tunnel create $TUNNEL_NAME

Write-Host "`nStep 4: Get your tunnel ID" -ForegroundColor Yellow
$tunnels = cloudflared tunnel list | Select-String -Pattern $TUNNEL_NAME
Write-Host $tunnels -ForegroundColor Green

Write-Host "`nStep 5: Get your AWS ECS task public IP" -ForegroundColor Yellow
$taskArn = aws ecs list-tasks --cluster betting-exchange-hybrid --service-name web-frontend --region us-east-1 --query 'taskArns[0]' --output text
if ($taskArn) {
    $taskDetails = aws ecs describe-tasks --cluster betting-exchange-hybrid --tasks $taskArn --region us-east-1 --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text
    if ($taskDetails) {
        $publicIp = aws ec2 describe-network-interfaces --network-interface-ids $taskDetails --region us-east-1 --query 'NetworkInterfaces[0].Association.PublicIp' --output text
        Write-Host "ECS Task Public IP: $publicIp" -ForegroundColor Green
        $ECS_IP = $publicIp
    }
}

if (-not $ECS_IP) {
    Write-Host "Could not auto-detect ECS IP. Please enter manually:" -ForegroundColor Yellow
    $ECS_IP = Read-Host "Enter ECS Task Public IP"
}

Write-Host "`nStep 6: Create tunnel config file" -ForegroundColor Yellow
$configPath = "$env:USERPROFILE\.cloudflared\config.yml"
$configDir = Split-Path $configPath
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$tunnelId = Read-Host "Enter your Tunnel ID from Step 4"

$config = @"
tunnel: $tunnelId
credentials-file: $env:USERPROFILE\.cloudflared\$tunnelId.json

ingress:
  # Web frontend
  - hostname: $DOMAIN
    service: http://${ECS_IP}:3001
  
  # Web frontend www subdomain
  - hostname: www.$DOMAIN
    service: http://${ECS_IP}:3001
  
  # API backend
  - hostname: api.$DOMAIN
    service: http://${ECS_IP}:3000
  
  # Catch-all rule (required)
  - service: http_status:404
"@

$config | Out-File -FilePath $configPath -Encoding UTF8
Write-Host "Config file created at: $configPath" -ForegroundColor Green

Write-Host "`nStep 7: Create DNS records in Cloudflare" -ForegroundColor Yellow
Write-Host "Run these commands:" -ForegroundColor Cyan
Write-Host "cloudflared tunnel route dns $tunnelId $DOMAIN" -ForegroundColor White
Write-Host "cloudflared tunnel route dns $tunnelId www.$DOMAIN" -ForegroundColor White
Write-Host "cloudflared tunnel route dns $tunnelId api.$DOMAIN" -ForegroundColor White

Write-Host "`nCreate DNS records now? (Y/N)" -ForegroundColor Yellow
$createDns = Read-Host
if ($createDns -eq "Y" -or $createDns -eq "y") {
    cloudflared tunnel route dns $tunnelId $DOMAIN
    cloudflared tunnel route dns $tunnelId "www.$DOMAIN"
    cloudflared tunnel route dns $tunnelId "api.$DOMAIN"
    Write-Host "DNS records created!" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`nTo start the tunnel, run:" -ForegroundColor Yellow
Write-Host "cloudflared tunnel run $tunnelId" -ForegroundColor Cyan

Write-Host "`nOr install as a service:" -ForegroundColor Yellow
Write-Host "cloudflared service install" -ForegroundColor Cyan
Write-Host "cloudflared service start" -ForegroundColor Cyan

Write-Host "`nYour sites will be accessible at:" -ForegroundColor Yellow
Write-Host "  https://$DOMAIN" -ForegroundColor Green
Write-Host "  https://www.$DOMAIN" -ForegroundColor Green
Write-Host "  https://api.$DOMAIN" -ForegroundColor Green
