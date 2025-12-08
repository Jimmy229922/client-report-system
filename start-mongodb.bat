@echo off
title MongoDB Launcher
color 0B

REM Store the script's directory
set "SCRIPT_DIR=%~dp0"

REM Determine the default data path and ensure it exists.
set "MONGO_DATA_PATH=C:\data\db"
if not exist "%MONGO_DATA_PATH%" (
    md "%MONGO_DATA_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Could not create "%MONGO_DATA_PATH%". Check permissions.
        exit /b 1
    )
)

REM Check if MongoDB is running as a Windows Service FIRST
sc query MongoDB 2>nul | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB is running as a Windows Service. No action needed.
    exit /b 0
)

REM Check if port 27017 is already in use
netstat -ano | findstr ":27017" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Port 27017 is already in use.
    
    REM Check if it's mongod.exe
    tasklist /FI "IMAGENAME eq mongod.exe" 2>nul | find /I "mongod.exe" >nul
    if %ERRORLEVEL% EQU 0 (
        echo [INFO] MongoDB is already running. No action needed.
        exit /b 0
    )
    
    echo [WARNING] Port 27017 is used by another process.
    echo [INFO] Trying to find and stop the process...
    
    REM Get the PID using the port and try to stop it
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":27017" ^| findstr "LISTENING"') do (
        echo [INFO] Stopping process with PID: %%a
        taskkill /PID %%a /F >nul 2>&1
    )
    
    timeout /t 2 /nobreak >nul
)

REM Check if mongod is already running.
tasklist /FI "IMAGENAME eq mongod.exe" 2>nul | find /I "mongod.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB is already running.
    exit /b 0
)

REM Verify mongod is available on PATH, else try common install path.
set "MONGOD_EXE="
where mongod >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "MONGOD_EXE=mongod"
) else (
    REM Try to find MongoDB in Program Files
    for /f "delims=" %%D in ('dir /b /ad "C:\Program Files\MongoDB\Server" 2^>nul') do (
        if exist "C:\Program Files\MongoDB\Server\%%D\bin\mongod.exe" (
            set "MONGOD_EXE=C:\Program Files\MongoDB\Server\%%D\bin\mongod.exe"
        )
    )
)

if not defined MONGOD_EXE (
    echo [ERROR] 'mongod' not found. Please install MongoDB Server or add it to PATH.
    echo Download: https://www.mongodb.com/try/download/community
    pause
    exit /b 1
)

REM Launch MongoDB in a separate window so the service stays alive.
echo [INFO] Starting MongoDB with dbpath "%MONGO_DATA_PATH%"...
start "MongoDB" cmd /k ""%MONGOD_EXE%" --dbpath "%MONGO_DATA_PATH%" --bind_ip 127.0.0.1"

REM Wait and verify it started
timeout /t 3 /nobreak >nul

netstat -ano | findstr ":27017" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB started successfully on port 27017.
    exit /b 0
)

echo [WARNING] MongoDB may not have started properly. Check the MongoDB window for errors.
exit /b 0
