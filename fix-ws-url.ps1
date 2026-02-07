# Fix WebSocket URL in ECS task definition
$clusterName = "betting-exchange-hybrid"
$taskFamily = "web-frontend-hybrid"
$region = "us-east-1"

Write-Host "Fetching current task definition..." -ForegroundColor Cyan
$taskDefJson = aws ecs describe-task-definition `
    --task-definition $taskFamily `
    --region $region `
    --query 'taskDefinition' `
    --output json | ConvertFrom-Json

# Build new environment array with correct URLs
$environment = @(
    @{name="NODE_ENV"; value="production"},
    @{name="PORT"; value="3001"},
    @{name="API_BASE_URL"; value="https://api.gamefix.fun"},
    @{name="VITE_API_URL"; value="https://api.gamefix.fun"},
    @{name="VITE_WS_URL"; value="https://api.gamefix.fun"},
    @{name="VITE_RUST_WS_URL"; value="wss://ws.gamefix.fun/ws"}
)

# Build new task definition
$newTaskDef = [ordered]@{
    family = $taskDefJson.family
    taskRoleArn = $taskDefJson.taskRoleArn
    executionRoleArn = $taskDefJson.executionRoleArn
    networkMode = $taskDefJson.networkMode
    containerDefinitions = @(
        @{
            name = $taskDefJson.containerDefinitions[0].name
            image = $taskDefJson.containerDefinitions[0].image
            essential = $true
            portMappings = @($taskDefJson.containerDefinitions[0].portMappings)
            environment = $environment
            logConfiguration = $taskDefJson.containerDefinitions[0].logConfiguration
        }
    )
    requiresCompatibilities = $taskDefJson.requiresCompatibilities
    cpu = $taskDefJson.cpu
    memory = $taskDefJson.memory
}

$jsonContent = $newTaskDef | ConvertTo-Json -Depth 10 -Compress
$tempFile = [System.IO.Path]::GetTempFileName()
$jsonContent | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline

Write-Host "Registering new task definition..." -ForegroundColor Cyan
$registeredJson = aws ecs register-task-definition `
    --region $region `
    --cli-input-json "file://$tempFile" `
    --output json

Remove-Item $tempFile

$registered = $registeredJson | ConvertFrom-Json

if ($registered.taskDefinition) {
    $newRevision = $registered.taskDefinition.revision
    Write-Host "✅ New task definition registered: ${taskFamily}:${newRevision}" -ForegroundColor Green
    
    Write-Host "Updating ECS service to use new task definition..." -ForegroundColor Cyan
    aws ecs update-service `
        --region $region `
        --cluster $clusterName `
        --service web-frontend `
        --task-definition "${taskFamily}:${newRevision}" `
        --force-new-deployment | Out-Null
    
    Write-Host "✅ Service updated and deploying new task" -ForegroundColor Green
    Write-Host "Wait 2-3 minutes for deployment to complete" -ForegroundColor Yellow
} else {
    Write-Host "❌ Failed to register task definition" -ForegroundColor Red
    Write-Host $registeredJson
}
