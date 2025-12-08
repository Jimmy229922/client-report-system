@echo off
title MongoDB Health Check
color 0B

REM Store the script's directory (with proper quoting for paths with spaces)
set "SCRIPT_DIR=%~dp0"

REM Check if MongoDB is running as a Windows Service FIRST
sc query MongoDB 2>nul | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB is running as a Windows Service.
    exit /b 0
)

REM Check if port 27017 is already listening (most reliable check)
netstat -ano | findstr ":27017" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB is running on port 27017.
    exit /b 0
)

REM Check if mongod.exe process is running
set "TASK_NAME=mongod.exe"
tasklist /FI "IMAGENAME eq %TASK_NAME%" 2>nul | find /I "%TASK_NAME%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB process already running.
    exit /b 0
)

echo [INFO] MongoDB is not running. Attempting to start it...
call "%SCRIPT_DIR%start-mongodb.bat"
timeout /t 3 /nobreak >nul

REM Verify MongoDB started - check port first (most reliable)
netstat -ano | findstr ":27017" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB started successfully.
    exit /b 0
)

REM Check process as fallback
tasklist /FI "IMAGENAME eq %TASK_NAME%" 2>nul | find /I "%TASK_NAME%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB process started.
    exit /b 0
)

REM Check Windows Service as another fallback
sc query MongoDB 2>nul | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB Windows Service is running.
    exit /b 0
)

echo [ERROR] MongoDB could not be started.
echo.
echo Possible solutions:
echo 1. Run this script as Administrator
echo 2. Check if another program is using port 27017
echo 3. Make sure MongoDB is installed correctly
echo.
exit /b 1
