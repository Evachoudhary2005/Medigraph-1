# MediGraph PowerShell Launcher
Set-Location $PSScriptRoot

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "             Starting MediGraph Services               " -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

# 1. Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from https://www.python.org/" -ForegroundColor Yellow
    Exit 1
}

# 2. Check Node / npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Exit 1
}

# 3. Ensure virtual environment exists
$venvPython = Join-Path $PSScriptRoot "apps\api\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "[SETUP] Python virtual environment not found. Creating apps\api\.venv..." -ForegroundColor Yellow
    python -m venv (Join-Path $PSScriptRoot "apps\api\.venv")
    Write-Host "[SETUP] Installing Python requirements..." -ForegroundColor Yellow
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install -r (Join-Path $PSScriptRoot "apps\api\requirements.txt")
}

# 4. Ensure web node_modules exists
$nodeModules = Join-Path $PSScriptRoot "apps\web\node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "[SETUP] Web node_modules not found. Running npm install..." -ForegroundColor Yellow
    Push-Location (Join-Path $PSScriptRoot "apps\web")
    npm install
    Pop-Location
}

Write-Host "[OK] Dependencies verified.`n" -ForegroundColor Green

Write-Host "Launching MediGraph Backend (Port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\api'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

Write-Host "Launching MediGraph Frontend (Port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\web'; npm run dev"

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "             MediGraph is up and running!              " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " - Web Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host " - API Docs:     http://localhost:8000/docs" -ForegroundColor Green
Write-Host " - OpenAPI Spec: http://localhost:8000/openapi.json`n" -ForegroundColor Green
