Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Updating ECS Task to Use Port 80" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Get the current task definition
Write-Host "`nGetting current task definition..." -ForegroundColor Yellow
$taskDef = aws ecs describe-task-definition --task-definition web-frontend-hybrid --query 'taskDefinition' | ConvertFrom-Json

# Update port mappings to use port 80
$taskDef.containerDefinitions[0].portMappings[0].containerPort = 3001
$taskDef.containerDefinitions[0].portMappings[0].hostPort = 80
$taskDef.containerDefinitions[0].portMappings[0].protocol = "tcp"

# Add environment variable to set port
if (-not $taskDef.containerDefinitions[0].environment) {
    $taskDef.containerDefinitions[0].environment = @()
}

$portEnv = $taskDef.containerDefinitions[0].environment | Where-Object { $_.name -eq "PORT" }
if (-not $portEnv) {
    $taskDef.containerDefinitions[0].environment += @{
        name = "PORT"
        value = "3001"
    }
}

# Remove fields that shouldn't be in the registration
$taskDef.PSObject.Properties.Remove('taskDefinitionArn')
$taskDef.PSObject.Properties.Remove('revision')
$taskDef.PSObject.Properties.Remove('status')
$taskDef.PSObject.Properties.Remove('requiresAttributes')
$taskDef.PSObject.Properties.Remove('compatibilities')
$taskDef.PSObject.Properties.Remove('registeredAt')
$taskDef.PSObject.Properties.Remove('registeredBy')

# Save to temp file
$taskDef | ConvertTo-Json -Depth 10 | Set-Content -Path "task-def-temp.json"

# Register new task definition
Write-Host "Registering new task definition with port 80..." -ForegroundColor Yellow
aws ecs register-task-definition --cli-input-json file://task-def-temp.json

# Update security group to allow port 80
Write-Host "`nUpdating security group to allow port 80..." -ForegroundColor Yellow

# Get the security group ID
$sgId = aws ec2 describe-security-groups --filters "Name=group-name,Values=*ECS*" --query "SecurityGroups[0].GroupId" --output text

if ($sgId) {
    Write-Host "Found security group: $sgId" -ForegroundColor Green
    
    # Add port 80 ingress rule
    aws ec2 authorize-security-group-ingress `
        --group-id $sgId `
        --protocol tcp `
        --port 80 `
        --cidr 0.0.0.0/0 2>$null
    
    Write-Host "Port 80 allowed (ignore error if already exists)" -ForegroundColor Green
}

# Update the service to use new task definition
Write-Host "`nUpdating ECS service with new task definition..." -ForegroundColor Yellow
aws ecs update-service `
    --cluster betting-exchange-hybrid `
    --service web-frontend `
    --task-definition web-frontend-hybrid `
    --force-new-deployment

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Update Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nWait 2-3 minutes for the new task to start, then:" -ForegroundColor Yellow
Write-Host "1. Test: http://34.204.86.104 (no port needed!)" -ForegroundColor Cyan
Write-Host "2. Test: http://gamefix.fun (if DNS is set)" -ForegroundColor Cyan
Write-Host "`nNote: Old task on port 3001 will be stopped automatically" -ForegroundColor Gray

# Clean up
Remove-Item task-def-temp.json -ErrorAction SilentlyContinue
