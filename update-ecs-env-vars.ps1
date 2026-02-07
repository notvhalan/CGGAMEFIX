Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Updating ECS Task Environment Variables" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$REGION = "us-east-1"
$TASK_FAMILY = "web-frontend-hybrid"

# Get current task definition
Write-Host "`nFetching current task definition..." -ForegroundColor Yellow
$taskDefJson = aws ecs describe-task-definition --region $REGION --task-definition $TASK_FAMILY
$taskDefObj = $taskDefJson | ConvertFrom-Json
$taskDef = $taskDefObj.taskDefinition

# Update environment variables
Write-Host "`nUpdating environment variables..." -ForegroundColor Yellow
$containerDef = $taskDef.containerDefinitions[0]

# Update environment variables in place
$containerDef.environment = @(
    @{ name = "NODE_ENV"; value = "production" }
    @{ name = "PORT"; value = "3001" }
    @{ name = "API_BASE_URL"; value = "http://gamefix.fun:3000" }
    @{ name = "VITE_API_URL"; value = "http://gamefix.fun:3000" }
    @{ name = "VITE_RUST_WS_URL"; value = "wss://ws.gamefix.fun/ws" }
)

Write-Host "`nNew environment variables:" -ForegroundColor Cyan
$containerDef.environment | ForEach-Object { Write-Host "  $($_.name) = $($_.value)" -ForegroundColor White }

# Build new task definition with only required fields
$newTaskDef = [ordered]@{
    family = $taskDef.family
    taskRoleArn = $taskDef.taskRoleArn
    executionRoleArn = $taskDef.executionRoleArn
    networkMode = $taskDef.networkMode
    containerDefinitions = @(
        @{
            name = $containerDef.name
            image = $containerDef.image
            cpu = $containerDef.cpu
            memory = $containerDef.memory
            portMappings = $containerDef.portMappings
            essential = $containerDef.essential
            environment = $containerDef.environment
            logConfiguration = $containerDef.logConfiguration
        }
    )
    requiresCompatibilities = $taskDef.requiresCompatibilities
    cpu = $taskDef.cpu
    memory = $taskDef.memory
}

# Convert to JSON and save
$jsonContent = $newTaskDef | ConvertTo-Json -Depth 10
Write-Host "`nTask definition JSON created" -ForegroundColor Green

# Register new task definition
Write-Host "`nRegistering new task definition..." -ForegroundColor Yellow
$jsonContent | Out-File -FilePath "temp-task-def.json" -Encoding utf8 -NoNewline
$registeredJson = aws ecs register-task-definition --region $REGION --cli-input-json file://temp-task-def.json
$registered = $registeredJson | ConvertFrom-Json
Remove-Item "temp-task-def.json" -ErrorAction SilentlyContinue

if ($registered.taskDefinition) {
    $newRevision = $registered.taskDefinition.revision
    Write-Host "New task definition registered: ${TASK_FAMILY}:${newRevision}" -ForegroundColor Green

    # Update service to use new task definition
    Write-Host "`nUpdating ECS service..." -ForegroundColor Yellow
    aws ecs update-service `
        --region $REGION `
        --cluster betting-exchange-hybrid `
        --service web-frontend `
        --task-definition "${TASK_FAMILY}:${newRevision}" `
        --force-new-deployment

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Environment Variables Updated!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nWait 3-4 minutes for deployment, then test on gamefix.fun" -ForegroundColor Yellow
} else {
    Write-Host "`nFailed to register task definition" -ForegroundColor Red
    Write-Host "Response: $registeredJson" -ForegroundColor Red
}
