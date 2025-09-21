@echo off
title Client Report System Server
color 0A

echo ===================================================
echo.
echo      Starting INZO LLC Report System Server...
echo.
echo ===================================================
echo.
echo This window must remain open for the server to work.
echo The application will open in your browser automatically.
echo.

REM Navigate to the backend directory
cd backend

REM Check if node_modules exists, if not, run npm install
IF NOT EXIST "node_modules" (
    echo.
    echo Installing backend dependencies for the first time...
    call npm install
    echo.
)

REM Check if config.json exists, if not, run the setup script
IF NOT EXIST "config.json" (
    echo.
    echo Configuration file not found. Starting one-time setup...
    node setup.js
    echo.
)

REM Start the Node.js server
node server.js

echo.
echo Server has stopped. You can close this window now.
pause
