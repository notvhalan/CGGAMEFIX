$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-DevWindow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [string]$Directory,

    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $safeTitle = $Title.Replace("'", "''")
  $safeDirectory = $Directory.Replace("'", "''")
  $safeCommand = $Command.Replace("'", "''")
  $windowCommand = "`$Host.UI.RawUI.WindowTitle = '$safeTitle'; Set-Location -LiteralPath '$safeDirectory'; $safeCommand"

  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $windowCommand
  )
}

Start-DevWindow -Title "CGGAMEFIX - pnpm dev" -Directory $root -Command "pnpm run dev"
Start-DevWindow -Title "CGGAMEFIX - docker compose" -Directory $root -Command "docker compose up"
Start-DevWindow -Title "CGGAMEFIX - rust exchange" -Directory (Join-Path $root "rust-exchange") -Command "cargo run"

Write-Host "Started pnpm dev, docker compose, and rust exchange in separate PowerShell windows."
