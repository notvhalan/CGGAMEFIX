Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Full Stack Deployment with WebSocket Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ECR_REPO = "474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid"
$CLUSTER = "betting-exchange-hybrid"
$REGION = "us-east-1"

# Set environment variables for build
$env:VITE_API_URL = "https://api.gamefix.fun"
$env:VITE_WS_URL = "https://api.gamefix.fun"
$env:VITE_RUST_WS_URL = "wss://ws.gamefix.fun/ws"
$env:API_BASE_URL = "https://api.gamefix.fun"

Write-Host "`nEnvironment variables set:" -ForegroundColor Yellow
Write-Host "  VITE_API_URL: $env:VITE_API_URL" -ForegroundColor Cyan
Write-Host "  VITE_WS_URL: $env:VITE_WS_URL" -ForegroundColor Cyan
Write-Host "  VITE_RUST_WS_URL: $env:VITE_RUST_WS_URL" -ForegroundColor Cyan
Write-Host "  API_BASE_URL: $env:API_BASE_URL" -ForegroundColor Cyan

# Login to ECR
Write-Host "`nLogging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin 474668399531.dkr.ecr.us-east-1.amazonaws.com

# Build new image with environment variables
Write-Host "`nBuilding Docker image with updated URLs..." -ForegroundColor Yellow
docker build `
    --build-arg VITE_API_URL=$env:VITE_API_URL `
    --build-arg VITE_WS_URL=$env:VITE_WS_URL `
    --build-arg VITE_RUST_WS_URL=$env:VITE_RUST_WS_URL `
    --build-arg API_BASE_URL=$env:API_BASE_URL `
    -t $ECR_REPO`:latest `
    -f apps/web/Dockerfile .

# Push to ECR
Write-Host "`nPushing to ECR..." -ForegroundColor Yellow
docker push $ECR_REPO`:latest

# Force new deployment
Write-Host "`nForcing new deployment..." -ForegroundColor Yellow
aws ecs update-service `
    --region $REGION `
    --cluster $CLUSTER `
    --service web-frontend `
    --force-new-deployment `
    --task-definition web-frontend-hybrid

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nWait 3-4 minutes for deployment, then:" -ForegroundColor Yellow
Write-Host "1. Get new IP: .\update-dns-after-deploy.ps1" -ForegroundColor Cyan
Write-Host "2. Test on gamefix.fun" -ForegroundColor Cyan
Write-Host "`nWebSocket and API will now work!" -ForegroundColor Green
