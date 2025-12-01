@echo off
title Client Report System Server
color 0A

echo ===================================================
echo      Starting INZO LLC Report System Server...
echo ===================================================
echo.

REM --- Pre-flight Checks ---
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check MongoDB before navigating to backend
echo [INFO] Checking MongoDB connection...
if exist "check-mongodb.bat" (
    call check-mongodb.bat
    if errorlevel 1 (
        echo.
        echo [ERROR] MongoDB check failed. Cannot start server.
        pause
        exit /b 1
    )
) else (
    echo [WARNING] check-mongodb.bat not found. Skipping MongoDB check...
    echo [WARNING] Server may fail if MongoDB is not running.
    timeout /t 3 /nobreak
)

REM Navigate to the backend directory
cd backend
if not exist "server.js" (
    echo [ERROR] Cannot find backend folder or server.js
    echo [ERROR] Make sure you're running this from the project root folder.
    cd ..
    pause
    exit /b 1
)

REM Check if node_modules exists, if not, run npm install
IF NOT EXIST "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        cd ..
        pause
        exit /b 1
    )
)

REM Check if config.json exists, if not, run the setup script
IF NOT EXIST "config.json" (
    echo [INFO] Running setup...
    node setup.js
    if errorlevel 1 (
        echo [ERROR] Setup failed.
        cd ..
        pause
        exit /b 1
    )
)

REM --- Ngrok Integration (Disabled for local-only mode) ---
REM If you need external access, re-enable the block below.
REM IF EXIST "ngrok.exe" (
REM     taskkill /F /IM ngrok.exe >nul 2>&1
REM     start "Ngrok" /B ngrok http 3001 > ngrok.log 2>&1
REM     timeout /t 4 /nobreak >nul
REM     node -e "require('./ngrok-updater.js')" 2>nul
REM )

echo.

:start_server
REM Start the Node.js server. The `call` command ensures that control returns here.
echo.
echo [INFO] Server is starting. This window will now display live server logs.
echo [INFO] Do NOT close this window. You can minimize it.

REM Always refresh config for this machine (ensures SERVER_URL points to local IP)
echo [INFO] Refreshing configuration for this machine...
node setup.js >nul 2>&1

REM Launch the frontend in the default browser
echo [INFO] Opening the application in your browser...
start "" "http://localhost:3001"

REM Give server a moment to initialize before logs flood the window
timeout /t 2 /nobreak >nul

REM Start the Node.js server in the current window. This is a blocking call.
node server.js

REM The script will only reach here if the server is stopped (e.g., with Ctrl+C)
echo.
echo --- The server has stopped. ---
cd ..
pause
exit /b 0

echo.
echo --- The server has stopped. ---
pause
