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

REM Navigate to the backend directory and run the setup script
cd backend
node setup.js

echo.
echo Setup script finished. You can close this window now.
pause