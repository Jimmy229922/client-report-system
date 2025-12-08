@echo off
title INZO System - First Time Setup
color 0B

set "PROJECT_ROOT=%~dp0"
echo --- INZO System Setup ---
echo This script will install dependencies, configure the backend, and launch MongoDB + the server.
echo.

echo [1/4] Installing required packages...
pushd "%PROJECT_ROOT%backend"
call npm install
if errorlevel 1 (
    popd
    echo [ERROR] Failed to install backend dependencies.
    goto error
)
echo.
echo [1/4] Packages installed successfully.
echo.

echo [2/4] Generating configuration from .env file...
node setup.js
if errorlevel 1 (
    popd
    echo [ERROR] Failed to generate configuration.
    goto error
)

REM Verify that config.json was generated (requires required keys in .env)
REM Adding a small delay and retry to handle potential filesystem latency
if not exist "config.json" (
    timeout /t 2 /nobreak >nul
)

if not exist "config.json" (
    popd
    echo.
    echo [WARNING] backend/config.json was not generated.
    echo - Open backend\.env and fill required values (BOT_TOKEN, CHAT_ID, MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD)
    echo - Then re-run setup.bat or run start-server.bat
    goto error
)
popd
echo.
echo [2/4] Configuration generated successfully.
echo.

echo [3/4] Ensuring MongoDB is running...
call "%PROJECT_ROOT%start-mongodb.bat"
if errorlevel 1 (
    echo [ERROR] MongoDB failed to start. Please install MongoDB or fix the path.
    goto error
)
echo.
echo [3/4] MongoDB launch requested.
echo.

echo [4/4] Launching the server window...
start "" "%PROJECT_ROOT%start-server.bat"
echo.
echo --- Setup process finished. ---
echo MongoDB window and server window have been opened. Keep them running while you use the app.
pause
exit /b 0

:error
echo.
echo --- Setup aborted with errors. ---
pause
exit /b 1
