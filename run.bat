@echo off
setlocal enabledelayedexpansion

title MediGraph Launcher
echo =======================================================
echo               Starting MediGraph Services
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ and check "Add to PATH".
    pause
    exit /b 1
)

:: 2. Check Node / npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 3. Ensure virtual environment exists
if not exist "apps\api\.venv\Scripts\python.exe" (
    echo [SETUP] Python virtual environment not found. Creating apps\api\.venv...
    python -m venv apps\api\.venv
    echo [SETUP] Installing required Python modules...
    apps\api\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
    apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
)

:: 4. Ensure web node_modules exists
if not exist "apps\web\node_modules" (
    echo [SETUP] Web dependencies not found. Installing node_modules...
    cd apps\web
    call npm install
    cd ..\..
)

echo [OK] Dependencies verified.
echo.
echo Launching MediGraph API (Port 8000)...
start "MediGraph API (Port 8000)" cmd /k "cd /d "%~dp0apps\api" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

echo Launching MediGraph Web (Port 3000)...
start "MediGraph Web (Port 3000)" cmd /k "cd /d "%~dp0apps\web" && npm run dev"

echo.
echo =======================================================
echo          MediGraph is up and running!
echo =======================================================
echo   - Web Frontend:  http://localhost:3000
echo   - API Docs:      http://localhost:8000/docs
echo   - OpenAPI Spec:  http://localhost:8000/openapi.json
echo.
echo Press any key to exit this launcher (services will keep running)...
pause >nul
