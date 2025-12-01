@echo off
echo.
echo ========================================
echo   Image Migration and Diagnostic Tool
echo ========================================
echo.
echo This tool will help fix image loading issues.
echo.
echo Please choose an option:
echo.
echo [1] Check current status (Diagnostic)
echo [2] Migrate image URLs to new format
echo [3] Run both (Diagnostic + Migration)
echo [4] Exit
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto diagnostic
if "%choice%"=="2" goto migrate
if "%choice%"=="3" goto both
if "%choice%"=="4" goto end

echo Invalid choice. Please run again.
goto end

:diagnostic
echo.
echo Running diagnostic...
echo.
cd backend
node check-gridfs-files.js
cd ..
echo.
pause
goto end

:migrate
echo.
echo Running migration...
echo.
cd backend
node migrate-image-urls.js
cd ..
echo.
echo Migration completed!
echo Please restart your server for changes to take effect.
echo.
pause
goto end

:both
echo.
echo Step 1: Running diagnostic...
echo.
cd backend
node check-gridfs-files.js
echo.
echo.
echo ========================================
echo Step 2: Running migration...
echo ========================================
echo.
node migrate-image-urls.js
cd ..
echo.
echo.
echo ========================================
echo All done!
echo ========================================
echo.
echo Please restart your server for changes to take effect.
echo.
pause
goto end

:end
exit
