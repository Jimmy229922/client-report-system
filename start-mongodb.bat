@echo off
title MongoDB Launcher
color 0B

REM Determine the default data path and ensure it exists.
set "MONGO_DATA_PATH=C:\data\db"
if not exist "%MONGO_DATA_PATH%" (
    md "%MONGO_DATA_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Could not create "%MONGO_DATA_PATH%". Check permissions.
        exit /b 1
    )
)

REM Check if mongod is already running.
tasklist /FI "IMAGENAME eq mongod.exe" 2>nul | find /I "mongod.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] MongoDB is already running.
    exit /b 0
)

REM Verify mongod is available on PATH, else try common install path.
set "MONGOD_EXE=mongod"
where mongod >nul 2>&1
if errorlevel 1 (
    for /f "delims=" %%D in ('dir /b /ad "C:\Program Files\MongoDB\Server" 2^>nul') do (
        if exist "C:\Program Files\MongoDB\Server\%%D\bin\mongod.exe" (
            set "MONGOD_EXE=C:\Program Files\MongoDB\Server\%%D\bin\mongod.exe"
        )
    )
)
if "%MONGOD_EXE%"=="mongod" (
    where mongod >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] 'mongod' not found. Please install MongoDB Server or add it to PATH.
        echo Download: https://www.mongodb.com/try/download/community
        pause
        exit /b 1
    )
)

REM Launch MongoDB in a separate window so the service stays alive.
echo [INFO] Starting MongoDB with dbpath "%MONGO_DATA_PATH%"...
start "MongoDB" cmd /k "%MONGOD_EXE% --dbpath \"%MONGO_DATA_PATH%\" --bind_ip 127.0.0.1"
exit /b 0
