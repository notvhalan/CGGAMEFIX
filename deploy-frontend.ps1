# Simple deployment script for web frontend
# Run this to deploy the frontend to AWS

$AWS_REGION = "us-east-1"
$AWS_ACCOUNT_ID = "474668399531"
$ECR_REPO = "betting-exchange/web-hybrid"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Deploying Frontend to AWS" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# 1. Create ECR repo
Write-Host "Creating ECR repository..." -ForegroundColor Yellow
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION 2>$null
Write-Host "Done (ignore error if exists)" -ForegroundColor Green

# 2. Login to ECR
Write-Host "Logging in to ECR..." -ForegroundColor Yellow
$loginCmd = "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
Invoke-Expression $loginCmd

# 3. Build image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -t "$ECR_REPO" -f apps/web/Dockerfile .

# 4. Tag image
Write-Host "Tagging image..." -ForegroundColor Yellow
docker tag "$ECR_REPO" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"

# 5. Push image
Write-Host "Pushing to ECR..." -ForegroundColor Yellow
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"

# 6. Create cluster
Write-Host "Creating ECS cluster..." -ForegroundColor Yellow
aws ecs create-cluster --cluster-name betting-exchange-hybrid --region $AWS_REGION 2>$null
Write-Host "Done (ignore error if exists)" -ForegroundColor Green

Write-Host "========================================" -ForegroundColor Green
Write-Host "Image pushed to ECR successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Image: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"
