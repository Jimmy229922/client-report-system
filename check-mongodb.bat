@echo off
title MongoDB Health Check
color 0B

set "TASK_NAME=mongod.exe"

REM Helper to verify whether mongod.exe is running.
tasklist /FI "IMAGENAME eq %TASK_NAME%" 2>nul | find /I "%TASK_NAME%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB process already running.
    exit /b 0
)

echo [INFO] MongoDB process is not running. Attempting to start it.
call "%~dp0start-mongodb.bat" >nul 2>&1
timeout /t 3 /nobreak >nul

tasklist /FI "IMAGENAME eq %TASK_NAME%" 2>nul | find /I "%TASK_NAME%" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB started successfully.
    exit /b 0
)

echo [ERROR] MongoDB still did not start. Please check MongoDB installation or PATH.
exit /b 1
