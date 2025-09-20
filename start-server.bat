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

REM Start the Node.js server
node server.js

echo.
echo Server has stopped. You can close this window now.
pause
