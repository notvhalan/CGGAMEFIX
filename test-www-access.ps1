Write-Host "Testing www.gamefix.fun access..." -ForegroundColor Cyan

Write-Host "`n1. DNS Check:" -ForegroundColor Yellow
nslookup www.gamefix.fun

Write-Host "`n2. Testing Frontend (port 3001):" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://www.gamefix.fun:3001/" -UseBasicParsing -TimeoutSec 10
    Write-Host "SUCCESS: HTTP $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content Length: $($response.RawContentLength) bytes" -ForegroundColor Green
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n3. Testing API (port 3000):" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://www.gamefix.fun:3000/v1/markets" -UseBasicParsing -TimeoutSec 10
    Write-Host "SUCCESS: HTTP $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
