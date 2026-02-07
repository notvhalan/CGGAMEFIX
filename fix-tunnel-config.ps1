# Fix Cloudflare Tunnel Configuration
# Frontend on AWS, Backend on local machine

$configPath = "$env:USERPROFILE\.cloudflared\config.yml"

Write-Host "Updating Cloudflare tunnel config..." -ForegroundColor Cyan
Write-Host "Frontend (AWS): http://44.211.235.43:3001" -ForegroundColor Yellow
Write-Host "Backend (Local): http://localhost:3000, ws://localhost:3001" -ForegroundColor Yellow

$config = @"
tunnel: 67b4921d-75b0-49c5-95e0-e47c9e9e3e1b
credentials-file: C:\Users\vhalan\.cloudflared\67b4921d-75b0-49c5-95e0-e47c9e9e3e1b.json

ingress:
  # Web frontend (AWS ECS)
  - hostname: gamefix.fun
    service: http://44.211.235.43:3001

  # Web frontend www subdomain (AWS ECS)
  - hostname: www.gamefix.fun
    service: http://44.211.235.43:3001

  # API backend (LOCAL MACHINE) - HTTP
  - hostname: api.gamefix.fun
    service: http://localhost:3000

  # WebSocket endpoint (LOCAL MACHINE) - Rust matching engine
  - hostname: ws.gamefix.fun
    service: ws://localhost:3001

  # Catch-all rule (required)
  - service: http_status:404
"@

$config | Out-File -FilePath $configPath -Encoding UTF8

Write-Host "`nConfig updated!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Make sure API is running locally: docker compose up -d" -ForegroundColor White
Write-Host "2. Restart tunnel: cloudflared service stop; cloudflared service start" -ForegroundColor White
Write-Host "3. Test: https://api.gamefix.fun/v1/markets" -ForegroundColor White
