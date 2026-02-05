# Test placing orders on the Rust exchange
$marketId = "550e8400-e29b-41d4-a716-446655440001"

Write-Host "Placing BUY_YES order at 56% for £10 risk..." -ForegroundColor Green
$buyOrder = @{
    market_id = $marketId
    side = "BuyYes"
    risk_pence = 1000  # £10
    limit_yes_pts = 5600000  # 56%
} | ConvertTo-Json

$response1 = Invoke-RestMethod -Uri "http://localhost:3001/api/orders" `
    -Method Post `
    -ContentType "application/json" `
    -Body $buyOrder

Write-Host "Order created: $($response1.order_id)" -ForegroundColor Cyan
Write-Host "Contracts: $($response1.contracts_micros / 1000000) contracts" -ForegroundColor Yellow
Write-Host "Status: $($response1.status)" -ForegroundColor Magenta
Write-Host ""

Start-Sleep -Seconds 1

Write-Host "Placing SELL_YES order at 56% for £10 risk (should match!)..." -ForegroundColor Green
$sellOrder = @{
    market_id = $marketId
    side = "SellYes"
    risk_pence = 1000  # £10
    limit_yes_pts = 5600000  # 56%
} | ConvertTo-Json

$response2 = Invoke-RestMethod -Uri "http://localhost:3001/api/orders" `
    -Method Post `
    -ContentType "application/json" `
    -Body $sellOrder

Write-Host "Order created: $($response2.order_id)" -ForegroundColor Cyan
Write-Host "Contracts: $($response2.contracts_micros / 1000000) contracts" -ForegroundColor Yellow
Write-Host "Status: $($response2.status)" -ForegroundColor Magenta
Write-Host ""
Write-Host "✅ Check your WebSocket test page for the trade broadcast!" -ForegroundColor Green
