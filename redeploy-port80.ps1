Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redeploying Frontend on Port 80" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ECR_REPO = "474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid"
$CLUSTER = "betting-exchange-hybrid"

# Login to ECR
Write-Host "`nLogging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 474668399531.dkr.ecr.us-east-1.amazonaws.com

# Build new image with port 80
Write-Host "`nBuilding Docker image with port 80..." -ForegroundColor Yellow
docker build -t $ECR_REPO`:latest -f apps/web/Dockerfile .

# Push to ECR
Write-Host "`nPushing to ECR..." -ForegroundColor Yellow
docker push $ECR_REPO`:latest

# Update security group to allow port 80
Write-Host "`nUpdating security group..." -ForegroundColor Yellow
$tasks = aws ecs list-tasks --cluster $CLUSTER --service-name web-frontend --query 'taskArns[0]' --output text

if ($tasks) {
    $taskDetails = aws ecs describe-tasks --cluster $CLUSTER --tasks $tasks | ConvertFrom-Json
    $eniId = ($taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
    
    if ($eniId) {
        $sgId = (aws ec2 describe-network-interfaces --network-interface-ids $eniId --query 'NetworkInterfaces[0].Groups[0].GroupId' --output text)
        
        Write-Host "Security Group: $sgId" -ForegroundColor Green
        
        # Allow port 80
        aws ec2 authorize-security-group-ingress --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 2>$null
        Write-Host "Port 80 allowed (ignore error if exists)" -ForegroundColor Green
    }
}

# Create new task definition with port 80
Write-Host "`nCreating task definition for port 80..." -ForegroundColor Yellow

$taskDefJson = @"
{
  "family": "web-frontend-hybrid",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::474668399531:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "web-frontend",
      "image": "$ECR_REPO:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "80"
        },
        {
          "name": "VITE_API_URL",
          "value": "https://api.gamefix.fun"
        },
        {
          "name": "VITE_WS_URL",
          "value": "wss://api.gamefix.fun"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/web-frontend-hybrid",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ]
}
"@

$taskDefJson | Out-File -FilePath "task-def-port80.json" -Encoding utf8

aws ecs register-task-definition --cli-input-json file://task-def-port80.json

# Update service
Write-Host "`nUpdating service with new task definition..." -ForegroundColor Yellow
aws ecs update-service --cluster $CLUSTER --service web-frontend --task-definition web-frontend-hybrid --force-new-deployment

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Deployment Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nWait 3-4 minutes for deployment, then test:" -ForegroundColor Yellow
Write-Host "  http://34.204.86.104" -ForegroundColor Cyan
Write-Host "  http://gamefix.fun" -ForegroundColor Cyan
Write-Host "`nNo :3001 needed!" -ForegroundColor Green

# Clean up
Remove-Item task-def-port80.json -ErrorAction SilentlyContinue
