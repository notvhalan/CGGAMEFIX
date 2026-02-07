# Update Cloudflare Tunnel Configuration with new ECS IP
# Use this after each deployment to update tunnel routing
# NOTE: For hybrid setup (frontend AWS, backend local), use fix-tunnel-config.ps1 instead!

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Update Cloudflare Tunnel Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Your existing tunnel details
$TUNNEL_ID = "67b4921d-75b0-49c5-95e0-e47c9e9e3e1b"
$TUNNEL_NAME = "betting-exchange-api"
$ECS_IP = "3.239.49.243"
$DOMAIN = "gamefix.fun"

Write-Host "`nTunnel ID: $TUNNEL_ID" -ForegroundColor Green
Write-Host "ECS IP: $ECS_IP" -ForegroundColor Green

# Create/Update tunnel config
Write-Host "`nUpdating tunnel configuration..." -ForegroundColor Yellow
$configPath = "$env:USERPROFILE\.cloudflared\config.yml"
$configDir = Split-Path $configPath
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = @"
tunnel: $TUNNEL_ID
credentials-file: $env:USERPROFILE\.cloudflared\$TUNNEL_ID.json

ingress:
  # Web frontend (AWS ECS)
  - hostname: $DOMAIN
    service: http://${ECS_IP}:3001
  
  # Web frontend www subdomain (AWS ECS)
  - hostname: www.$DOMAIN
    service: http://${ECS_IP}:3001
  
  # API backend (LOCAL MACHINE)
  - hostname: api.$DOMAIN
    service: http://localhost:3000
  
  # WebSocket endpoint (LOCAL MACHINE) - Rust matching engine
  - hostname: ws.$DOMAIN
    service: ws://localhost:3001
  
  # Catch-all rule (required)
  - service: http_status:404
"@

$config | Out-File -FilePath $configPath -Encoding UTF8
Write-Host "Config updated: $configPath" -ForegroundColor Green

Write-Host "`nConfig contents:" -ForegroundColor Yellow
Get-Content $configPath | Write-Host -ForegroundColor Gray

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Next Steps" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`n1. Restart your tunnel:" -ForegroundColor Yellow
Write-Host "   If running as service:" -ForegroundColor Cyan
Write-Host "   cloudflared service stop" -ForegroundColor White
Write-Host "   cloudflared service start" -ForegroundColor White
Write-Host "`n   If running manually:" -ForegroundColor Cyan
Write-Host "   Press Ctrl+C to stop then run:" -ForegroundColor White
Write-Host "   cloudflared tunnel run $TUNNEL_ID" -ForegroundColor White

Write-Host "`n2. Test your sites:" -ForegroundColor Yellow
Write-Host "   https://$DOMAIN" -ForegroundColor Green
Write-Host "   https://www.$DOMAIN" -ForegroundColor Green
Write-Host "   https://api.$DOMAIN/v1/markets" -ForegroundColor Green

Write-Host "`n3. If DNS records do not exist create them:" -ForegroundColor Yellow
Write-Host "   cloudflared tunnel route dns $TUNNEL_ID $DOMAIN" -ForegroundColor White
Write-Host "   cloudflared tunnel route dns $TUNNEL_ID www.$DOMAIN" -ForegroundColor White
Write-Host "   cloudflared tunnel route dns $TUNNEL_ID api.$DOMAIN" -ForegroundColor White
