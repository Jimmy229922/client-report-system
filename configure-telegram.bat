@echo off
color 0A
setlocal ENABLEDELAYEDEXPANSION

echo ==================================================
echo   Client Report System - Telegram Configuration
echo ==================================================

REM Ensure backend folder exists
if not exist "backend" (
  echo [ERROR] backend folder not found. Run from project root.
  pause
  exit /b 1
)

set "ENV_PATH=backend\.env"

REM Ask for Telegram details
echo.
echo Enter your Telegram bot token and chat ID.
echo (These will be saved to backend\.env)
set /p BOT_TOKEN=BOT_TOKEN: 
set /p CHAT_ID=CHAT_ID: 

if "%BOT_TOKEN%"=="" (
  echo [ERROR] BOT_TOKEN cannot be empty.
  pause
  exit /b 1
)
if "%CHAT_ID%"=="" (
  echo [ERROR] CHAT_ID cannot be empty.
  pause
  exit /b 1
)

REM Default values (can be changed later)
set "MONGODB_URI=mongodb://127.0.0.1:27017/client-report-system"
set "ADMIN_EMAIL=admin@inzo.com"
set "ADMIN_PASSWORD=inzo123"
set "PORT=3001"

>"%ENV_PATH%" echo TELEGRAM_DISABLED=false
>>"%ENV_PATH%" echo BOT_TOKEN="%BOT_TOKEN%"
>>"%ENV_PATH%" echo CHAT_ID="%CHAT_ID%"
>>"%ENV_PATH%" echo MONGODB_URI="%MONGODB_URI%"
>>"%ENV_PATH%" echo ADMIN_EMAIL="%ADMIN_EMAIL%"
>>"%ENV_PATH%" echo ADMIN_PASSWORD="%ADMIN_PASSWORD%"
>>"%ENV_PATH%" echo PORT=%PORT%

echo.
echo [OK] backend\.env has been created with Telegram enabled.
echo.
echo Running setup to generate config.json ...
pushd backend
node setup.js
popd

if not exist "backend\config.json" (
  echo [ERROR] Failed to generate backend\config.json. Check your inputs.
  pause
  exit /b 1
)

echo.
echo Done. You can now run start-server.bat
pause
exit /b 0
