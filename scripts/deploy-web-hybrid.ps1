# Deploy Web Frontend to AWS ECS Fargate (PowerShell)

$ErrorActionPreference = "Stop"

# Configuration
$AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$AWS_ACCOUNT_ID = "474668399531"
$ECR_REPOSITORY = "betting-exchange/web-hybrid"
$ECS_CLUSTER = "betting-exchange-hybrid"
$ECS_SERVICE = "web-frontend"
$IMAGE_TAG = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

Write-Host "========================================" -ForegroundColor Green
Write-Host "Deploying Frontend to AWS" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Check AWS credentials
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
$credentials = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: AWS credentials not configured" -ForegroundColor Red
    exit 1
}
Write-Host "✓ AWS credentials verified" -ForegroundColor Green

# Create ECR repository if it doesn't exist
Write-Host "Checking ECR repository..." -ForegroundColor Yellow
$repoCheck = aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating ECR repository..." -ForegroundColor Yellow
    aws ecr create-repository `
        --repository-name $ECR_REPOSITORY `
        --region $AWS_REGION `
        --image-scanning-configuration scanOnPush=false | Out-Null
    Write-Host "✓ ECR repository created" -ForegroundColor Green
}
else {
    Write-Host "✓ ECR repository exists" -ForegroundColor Green
}

# Login to ECR
Write-Host "Logging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $AWS_REGION | `
    docker login --username AWS --password-stdin `
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

Write-Host "✓ ECR login successful" -ForegroundColor Green

# Build Docker image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build `
    -t "${ECR_REPOSITORY}:${IMAGE_TAG}" `
    -t "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}" `
    -t "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest" `
    -f apps/web/Dockerfile .

Write-Host "✓ Docker image built" -ForegroundColor Green

# Push to ECR
Write-Host "Pushing image to ECR..." -ForegroundColor Yellow
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
docker push "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:latest"

Write-Host "✓ Image pushed to ECR" -ForegroundColor Green

# Check if ECS cluster exists
Write-Host "Checking ECS cluster..." -ForegroundColor Yellow
$clusterCheck = aws ecs describe-clusters --clusters $ECS_CLUSTER --region $AWS_REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating ECS cluster..." -ForegroundColor Yellow
    aws ecs create-cluster --cluster-name $ECS_CLUSTER --region $AWS_REGION | Out-Null
    Write-Host "✓ ECS cluster created" -ForegroundColor Green
}
else {
    Write-Host "✓ ECS cluster exists" -ForegroundColor Green
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Deployment completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"
Write-Host "Region: ${AWS_REGION}"
Write-Host ""
Write-Host "Next: Create ECS service manually or use Terraform"
