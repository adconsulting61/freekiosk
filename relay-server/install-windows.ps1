# FreeKiosk Relay Server - Windows Installer
# Run as Administrator: Right-click PowerShell → "Run as Administrator"
# Then: powershell -ExecutionPolicy Bypass -File install-windows.ps1

$ErrorActionPreference = "Stop"
$InstallDir = "C:\freekiosk-relay"
$ServiceName = "FreeKioskRelay"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  FreeKiosk Relay Server - Windows Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Check admin ───────────────────────────────────────────────────────────
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Run this script as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell and choose 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# ── Install Node.js if missing ────────────────────────────────────────────
$nodeInstalled = $null
try { $nodeInstalled = Get-Command node -ErrorAction Stop } catch {}

if (-not $nodeInstalled) {
    Write-Host "Node.js not found. Downloading installer..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    Write-Host "Installing Node.js (this takes ~1 minute)..." -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Host "Node.js installed." -ForegroundColor Green
} else {
    Write-Host "Node.js already installed: $(node --version)" -ForegroundColor Green
}

# ── Install pm2 (keeps server running, auto-starts on reboot) ────────────
Write-Host "Installing pm2 process manager..." -ForegroundColor Yellow
npm install -g pm2 pm2-windows-startup 2>&1 | Out-Null
Write-Host "pm2 installed." -ForegroundColor Green

# ── Copy server files ─────────────────────────────────────────────────────
Write-Host "Copying server files to $InstallDir..." -ForegroundColor Yellow
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Path $InstallDir | Out-Null
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$scriptDir\server.js" $InstallDir
Copy-Item "$scriptDir\package.json" $InstallDir
if (Test-Path "$scriptDir\public") {
    Copy-Item "$scriptDir\public" "$InstallDir\public" -Recurse
}

# ── Install dependencies ──────────────────────────────────────────────────
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $InstallDir
npm install --omit=dev 2>&1 | Out-Null
Write-Host "Dependencies installed." -ForegroundColor Green

# ── Configure .env ────────────────────────────────────────────────────────
$existingEnv = "$InstallDir\.env"
if (-not (Test-Path $existingEnv)) {
    $secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    @"
PORT=3000
STREAM_SECRET=$secret
"@ | Set-Content $existingEnv
    Write-Host ""
    Write-Host "Generated secret key: $secret" -ForegroundColor Magenta
    Write-Host "(Save this — you'll need it in the kiosk app settings)" -ForegroundColor Yellow
} else {
    $secret = (Get-Content $existingEnv | Where-Object { $_ -match "STREAM_SECRET=" }) -replace "STREAM_SECRET=",""
    Write-Host "Existing .env kept. Secret: $secret" -ForegroundColor Green
}

# ── Open firewall port ────────────────────────────────────────────────────
Write-Host "Opening firewall port 3000..." -ForegroundColor Yellow
$rule = Get-NetFirewallRule -DisplayName "FreeKiosk Relay" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule -DisplayName "FreeKiosk Relay" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
}
Write-Host "Firewall rule added." -ForegroundColor Green

# ── Start with pm2 ───────────────────────────────────────────────────────
Write-Host "Starting relay server with pm2..." -ForegroundColor Yellow
Set-Location $InstallDir
pm2 delete $ServiceName 2>&1 | Out-Null
pm2 start server.js --name $ServiceName 2>&1 | Out-Null
pm2 save 2>&1 | Out-Null

# Set pm2 to start on Windows boot
pm2-startup install 2>&1 | Out-Null

# ── Get local IP ──────────────────────────────────────────────────────────
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.*" } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Server URL (local network):  ws://$localIp`:3000" -ForegroundColor Cyan
Write-Host "Admin dashboard:             http://$localIp`:3000" -ForegroundColor Cyan
Write-Host "Secret key:                  $secret" -ForegroundColor Magenta
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. For internet access, set up port forwarding on your router:"
Write-Host "   External port 3000 → $localIp`:3000"
Write-Host "   Or use a free tunnel: https://ngrok.com"
Write-Host ""
Write-Host "2. In the kiosk app: Settings → Advanced → Remote Monitoring"
Write-Host "   Relay URL: ws://YOUR-PUBLIC-IP:3000"
Write-Host "   (replace YOUR-PUBLIC-IP with your home/office IP)"
Write-Host ""
Write-Host "To check status: pm2 status"
Write-Host "To view logs:    pm2 logs FreeKioskRelay"
Write-Host "To stop:         pm2 stop FreeKioskRelay"
Write-Host ""
pause
