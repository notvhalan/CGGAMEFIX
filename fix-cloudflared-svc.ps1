$ErrorActionPreference = "Stop"
$TOKEN = "eyJhIjoiMjg5NGVlYTc0YjFiZTc1NTk0YzBlZmIxNWQ5M2JmMTgiLCJ0IjoiNjdiNDkyMWQtNzViMC00OWM1LTk1ZTAtZTQ3YzllOWUzZTFiIiwicyI6Ik5qTmpaVEkzWmpJdE1EWTFaUzAwTURkakxXSmhOekV0TldRek1XSXdNR0prWVRkaiJ9"
try {
    Stop-Service Cloudflared -Force
    Write-Host "Service stopped"
    
    # Revert to token-based remote management
    $newPath = "`"C:\Program Files (x86)\cloudflared\cloudflared.exe`" tunnel run --token $TOKEN"
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared" -Name ImagePath -Value $newPath
    Write-Host "Registry reverted to token mode"
    
    Start-Service Cloudflared
    Write-Host "Service started with remote config (token)"
    
    $check = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared").ImagePath
    Write-Host "ImagePath: $check"
} catch {
    Write-Host "ERROR: $_"
}
Read-Host "Press Enter to close"
