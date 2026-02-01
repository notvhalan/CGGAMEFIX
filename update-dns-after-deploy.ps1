# This script gets the current ECS task IP and updates Cloudflare DNS automatically
# Run this after each deployment to update gamefix.fun to point to the new IP

$CLOUDFLARE_API_TOKEN = "" # Get from: https://dash.cloudflare.com/profile/api-tokens
$CLOUDFLARE_ZONE_ID = ""   # Get from: https://dash.cloudflare.com/ → gamefix.fun → Overview (right sidebar)
$DOMAIN = "gamefix.fun"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Auto-Update DNS After Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Get current ECS task IP
Write-Host "`nGetting current ECS task IP..." -ForegroundColor Yellow
$taskArn = aws ecs list-tasks --region us-east-1 --cluster betting-exchange-hybrid --service-name web-frontend --query 'taskArns[0]' --output text

if (-not $taskArn -or $taskArn -eq "None") {
    Write-Host "ERROR: No running tasks found!" -ForegroundColor Red
    exit 1
}

$taskDetails = aws ecs describe-tasks --region us-east-1 --cluster betting-exchange-hybrid --tasks $taskArn | ConvertFrom-Json
$eniId = ($taskDetails.tasks[0].attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
$newIP = aws ec2 describe-network-interfaces --region us-east-1 --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text

Write-Host "New IP: $newIP" -ForegroundColor Green

# Check if Cloudflare credentials are set
if (-not $CLOUDFLARE_API_TOKEN -or -not $CLOUDFLARE_ZONE_ID) {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "Manual Update Required" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "`nTo enable auto-update, add your Cloudflare credentials to this script:" -ForegroundColor White
    Write-Host "1. API Token: https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Gray
    Write-Host "   - Click 'Create Token' → 'Edit zone DNS' template" -ForegroundColor Gray
    Write-Host "2. Zone ID: https://dash.cloudflare.com/ → gamefix.fun → Overview (right sidebar)" -ForegroundColor Gray
    Write-Host "`nFor now, manually update DNS:" -ForegroundColor White
    Write-Host "1. Go to: https://dash.cloudflare.com/" -ForegroundColor Cyan
    Write-Host "2. Click: gamefix.fun → DNS → Records" -ForegroundColor Cyan
    Write-Host "3. Edit the '@' A record" -ForegroundColor Cyan
    Write-Host "4. Change IP to: $newIP" -ForegroundColor Green
    Write-Host "5. Save" -ForegroundColor Cyan
    exit 0
}

# Get DNS record ID
Write-Host "`nFinding DNS record..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $CLOUDFLARE_API_TOKEN"
    "Content-Type" = "application/json"
}

$listUrl = "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?type=A&name=$DOMAIN"
$response = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Get

if ($response.result.Count -eq 0) {
    Write-Host "ERROR: No A record found for $DOMAIN" -ForegroundColor Red
    Write-Host "Create it first in Cloudflare dashboard" -ForegroundColor Yellow
    exit 1
}

$recordId = $response.result[0].id
$oldIP = $response.result[0].content

Write-Host "Old IP: $oldIP" -ForegroundColor Yellow

if ($oldIP -eq $newIP) {
    Write-Host "`nDNS already points to current IP - no update needed!" -ForegroundColor Green
    exit 0
}

# Update DNS record
Write-Host "`nUpdating DNS record..." -ForegroundColor Yellow
$updateUrl = "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$recordId"
$body = @{
    type = "A"
    name = "@"
    content = $newIP
    ttl = 1
    proxied = $false
} | ConvertTo-Json

$updateResponse = Invoke-RestMethod -Uri $updateUrl -Headers $headers -Method Put -Body $body

if ($updateResponse.success) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "DNS Updated Successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nOld IP: $oldIP" -ForegroundColor Gray
    Write-Host "New IP: $newIP" -ForegroundColor Green
    Write-Host "`nYour site will be live at http://gamefix.fun:3001 in 1-2 minutes" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: Failed to update DNS" -ForegroundColor Red
    Write-Host $updateResponse.errors
}
