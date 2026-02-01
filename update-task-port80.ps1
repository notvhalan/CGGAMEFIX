Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating Task Definition for Port 80" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$REGION = "us-east-1"
$CLUSTER = "betting-exchange-hybrid"
$ECR_REPO = "474668399531.dkr.ecr.us-east-1.amazonaws.com/betting-exchange/web-hybrid"

# Create task definition JSON
Write-Host "`nCreating task definition..." -ForegroundColor Yellow

$taskDef = @{
    family = "web-frontend-hybrid"
    networkMode = "awsvpc"
    requiresCompatibilities = @("FARGATE")
    cpu = "256"
    memory = "512"
    executionRoleArn = "arn:aws:iam::474668399531:role/ecsTaskExecutionRole"
    containerDefinitions = @(
        @{
            name = "web-frontend"
            image = "$ECR_REPO`:latest"
            essential = $true
            portMappings = @(
                @{
                    containerPort = 80
                    protocol = "tcp"
                }
            )
            environment = @(
                @{
                    name = "NODE_ENV"
                    value = "production"
                },
                @{
                    name = "PORT"
                    value = "80"
                },
                @{
                    name = "VITE_API_URL"
                    value = "https://api.gamefix.fun"
                },
                @{
                    name = "VITE_WS_URL"
                    value = "wss://api.gamefix.fun"
                }
            )
            logConfiguration = @{
                logDriver = "awslogs"
                options = @{
                    "awslogs-group" = "/ecs/web-frontend-hybrid"
                    "awslogs-region" = "us-east-1"
                    "awslogs-stream-prefix" = "ecs"
                    "awslogs-create-group" = "true"
                }
            }
        }
    )
}

# Convert to JSON and save
$taskDefJson = $taskDef | ConvertTo-Json -Depth 10
$taskDefJson | Out-File -FilePath "task-def-port80.json" -Encoding utf8 -NoNewline

# Register task definition
Write-Host "Registering task definition..." -ForegroundColor Yellow
aws ecs register-task-definition --region $REGION --cli-input-json file://task-def-port80.json

if ($LASTEXITCODE -eq 0) {
    Write-Host "Task definition registered successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to register task definition" -ForegroundColor Red
    exit 1
}

# Get current service's security group
Write-Host "`nUpdating security group..." -ForegroundColor Yellow
$tasks = aws ecs list-tasks --region $REGION --cluster $CLUSTER --service-name web-frontend --query 'taskArns[0]' --output text

if ($tasks -and $tasks -ne "None") {
    $taskDetails = aws ecs describe-tasks --region $REGION --cluster $CLUSTER --tasks $tasks | ConvertFrom-Json
    $eniId = ($taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
    
    if ($eniId) {
        $sgId = aws ec2 describe-network-interfaces --region $REGION --network-interface-ids $eniId --query 'NetworkInterfaces[0].Groups[0].GroupId' --output text
        
        Write-Host "Security Group ID: $sgId" -ForegroundColor Green
        
        # Allow port 80
        aws ec2 authorize-security-group-ingress --region $REGION --group-id $sgId --protocol tcp --port 80 --cidr 0.0.0.0/0 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Port 80 allowed successfully!" -ForegroundColor Green
        } else {
            Write-Host "Port 80 rule already exists or added" -ForegroundColor Yellow
        }
    }
}

# Update service with new task definition
Write-Host "`nUpdating ECS service..." -ForegroundColor Yellow
aws ecs update-service --region $REGION --cluster $CLUSTER --service web-frontend --task-definition web-frontend-hybrid --force-new-deployment

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Deployment Started Successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nWait 3-4 minutes for new task to start, then test:" -ForegroundColor Yellow
    Write-Host "  http://34.204.86.104" -ForegroundColor Cyan
    Write-Host "  http://gamefix.fun" -ForegroundColor Cyan
    Write-Host "`nNo :3001 needed!" -ForegroundColor Green
} else {
    Write-Host "Failed to update service" -ForegroundColor Red
    exit 1
}

# Clean up
Remove-Item task-def-port80.json -ErrorAction SilentlyContinue
