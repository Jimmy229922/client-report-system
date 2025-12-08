@echo off
title Stop Server
color 0C

echo ===================================================
echo      Stopping INZO System Server...
echo ===================================================
echo.

REM Kill Node.js processes
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js server stopped successfully.
) else (
    echo [INFO] No Node.js server was running.
)

echo.
echo --- Done ---
timeout /t 2 /nobreak >nul
