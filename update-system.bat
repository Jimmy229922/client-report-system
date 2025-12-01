@echo off
color 0E
title System Update - Client Report System

echo ========================================
echo   Client Report System - Auto Update
echo ========================================
echo.
echo This will pull the latest updates from GitHub
echo and restart the server automatically.
echo.
pause

REM Check if git is available
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git from: https://git-scm.com/
    pause
    exit /b 1
)

echo [INFO] Fetching latest updates from GitHub...
git fetch origin main

REM Check if there are updates
git diff --quiet HEAD origin/main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [INFO] System is already up to date!
    echo No updates available.
    pause
    exit /b 0
)

echo [INFO] Updates found! Pulling changes...
git pull origin main

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to pull updates.
    echo Please check for merge conflicts or network issues.
    pause
    exit /b 1
)

echo.
echo [INFO] Installing/updating dependencies...
pushd backend
call npm install --silent
popd

pushd frontend
if exist "package.json" (
    call npm install --silent
)
popd

echo.
echo [SUCCESS] System updated successfully!
echo.
echo The server will restart now...
timeout /t 3 /nobreak

REM Restart the server
start "" "%~dp0start-server.bat"

echo.
echo Update complete. The server is starting in a new window.
timeout /t 2 /nobreak
exit /b 0
