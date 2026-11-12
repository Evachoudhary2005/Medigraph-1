# MediGraph PowerShell Module Installer
Set-Location $PSScriptRoot

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "         MediGraph - Full Module Installation          " -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

# 1. Check prerequisites
Write-Host "[1/3] Checking Prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
python --version

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm is not installed or not in PATH." -ForegroundColor Red
    Exit 1
}
node --version
npm --version

# 2. Setup Python environment and install packages
Write-Host "`n[2/3] Setting up Python Environment & Installing Backend Modules..." -ForegroundColor Yellow
$venvPython = Join-Path $PSScriptRoot "apps\api\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Creating virtual environment at apps\api\.venv..." -ForegroundColor Cyan
    python -m venv (Join-Path $PSScriptRoot "apps\api\.venv")
}

Write-Host "Upgrading pip in .venv..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip --quiet

Write-Host "Installing all required packages from requirements.txt..." -ForegroundColor Cyan
& $venvPython -m pip install -r (Join-Path $PSScriptRoot "apps\api\requirements.txt")

Write-Host "Verifying Python imports..." -ForegroundColor Cyan
& $venvPython -c "import fastapi, uvicorn, pydantic, sqlalchemy, faster_whisper, paddleocr, cv2, PIL, reportlab; print('[OK] Core Python modules successfully verified!')"

# 3. Setup web dependencies
Write-Host "`n[3/3] Installing Web Frontend Dependencies..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "apps\web")
npm install
Pop-Location

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "    SUCCESS! All backend & frontend modules installed! " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "You can now launch the application by running:" -ForegroundColor White
Write-Host "  - run.bat   (Command Prompt)" -ForegroundColor White
Write-Host "  - run.ps1   (PowerShell)`n" -ForegroundColor White
