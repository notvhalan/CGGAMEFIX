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

# Register updated task definition (port 80 for Cloudflare proxied mode)
Write-Host "`nRegistering task definition (port 80)..." -ForegroundColor Yellow
# Re-save as UTF-8 no BOM to avoid AWS CLI parse errors
$taskDefJson = Get-Content "$PSScriptRoot\task-def-port80.json" -Raw
[System.IO.File]::WriteAllText("$PSScriptRoot\task-def-port80.json", $taskDefJson, [System.Text.UTF8Encoding]::new($false))
$taskDefArn = aws ecs register-task-definition `
    --region $REGION `
    --cli-input-json "file://$PSScriptRoot/task-def-port80.json" `
    --query 'taskDefinition.taskDefinitionArn' `
    --output text
Write-Host "  Registered: $taskDefArn" -ForegroundColor Green

# Force new deployment with the new task definition
Write-Host "`nForcing new deployment..." -ForegroundColor Yellow
aws ecs update-service `
    --region $REGION `
    --cluster $CLUSTER `
    --service web-frontend `
    --force-new-deployment `
    --task-definition $taskDefArn

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nWait 3-4 minutes for the new task to start." -ForegroundColor Yellow
Write-Host "Site will be live at https://gamefix.fun (Cloudflare proxied → port 80)" -ForegroundColor Green
Write-Host "`nIf the ECS task IP changes, run: .\update-after-deploy.ps1" -ForegroundColor Gray
