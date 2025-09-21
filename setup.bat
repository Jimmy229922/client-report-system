@echo off
title Client Report System - Setup
color 0B

echo ===================================================
echo.
echo      Welcome to the INZO LLC Report System Setup
echo.
echo ===================================================
echo.
echo This script is for the system administrator to perform the
echo initial setup. It will create a shared configuration file.
echo You should only need to run this once.
echo.
echo Installing backend dependencies...
cd backend
call npm install
echo.
echo Backend dependencies installed.
echo.

REM Navigate to the backend directory and run the setup script
node setup.js

echo.
echo Setup complete! The system is now ready.
echo You can now zip this entire 'client-report-system' folder and send it to your employees.
pause