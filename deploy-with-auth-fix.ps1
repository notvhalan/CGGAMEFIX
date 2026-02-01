Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploying Fixed Auth Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ECR_REPO = "474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid"
$CLUSTER = "betting-exchange-hybrid"
$REGION = "us-east-1"

# Login to ECR
Write-Host "`nLogging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin 474668399531.dkr.ecr.us-east-1.amazonaws.com

# Build new image with fixed auth
Write-Host "`nBuilding Docker image with auth fixes..." -ForegroundColor Yellow
docker build -t $ECR_REPO`:latest -f apps/web/Dockerfile .

# Push to ECR
Write-Host "`nPushing to ECR..." -ForegroundColor Yellow
docker push $ECR_REPO`:latest

# Force new deployment
Write-Host "`nForcing new deployment with updated environment..." -ForegroundColor Yellow
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
Write-Host "2. Test auth on phone: http://gamefix.fun:3001" -ForegroundColor Cyan
Write-Host "`nAuth will now work on mobile!" -ForegroundColor Green
