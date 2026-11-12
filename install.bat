@echo off
setlocal enabledelayedexpansion

title MediGraph - Module Installer
echo =======================================================
echo          MediGraph - Full Module Installation
echo =======================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Prerequisites...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to PATH.
    echo Please install Python 3.10+ from https://www.python.org/ and check "Add Python to PATH".
    pause
    exit /b 1
)
python --version

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not installed or not added to PATH.
    echo Please install Node.js (LTS) from https://nodejs.org/
    pause
    exit /b 1
)
node --version
npm --version
echo.

echo [2/3] Setting up Python Environment & Installing Backend Modules...
if not exist "apps\api\.venv\Scripts\python.exe" (
    echo Creating virtual environment at apps\api\.venv...
    python -m venv apps\api\.venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

echo Upgrading pip in .venv...
apps\api\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet

echo Installing all required Python packages from requirements.txt...
apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Some packages reported errors or warnings during install. Checking imports...
)

echo.
echo Verifying Python imports...
apps\api\.venv\Scripts\python.exe -c "import fastapi, uvicorn, pydantic, sqlalchemy, faster_whisper, paddleocr, cv2, PIL, reportlab; print('[OK] Core Python modules successfully verified!')"
if %errorlevel% neq 0 (
    echo [ERROR] Verification failed. Please inspect the output above.
    pause
    exit /b 1
)

echo.
echo [3/3] Installing Web Frontend Dependencies...
cd apps\web
echo Running npm install in apps\web...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install encountered errors.
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

echo.
echo =======================================================
echo     SUCCESS! All backend & frontend modules installed!
echo =======================================================
echo You can now launch the application by running:
echo   - run.bat   (Command Prompt)
echo   - run.ps1   (PowerShell)
echo.
pause
