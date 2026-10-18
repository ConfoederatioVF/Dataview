@echo off
setlocal
set NODE_OPTIONS=--max-old-space-size=16384
title Confoederatio Dataview

:: Change to the directory where this script is located
cd /d "%~dp0"

echo ===================================================
echo           Dataview Webviewer Launcher              
echo ===================================================
echo.

:: Verify Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] node_modules directory not found. Installing dependencies...
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b %ERRORLEVEL%
    )
    echo.
)

:: Command-line argument bypass
if /i "%~1"=="dev" goto start_dev
if /i "%~1"=="--dev" goto start_dev
if /i "%~1"=="preview" goto start_preview
if /i "%~1"=="prod" goto start_preview
if /i "%~1"=="build" goto start_preview
if /i "%~1"=="rebuild" goto do_rebuild
if /i "%~1"=="--rebuild" goto do_rebuild

:: Interactive startup menu
echo Choose server mode to run:
echo.
echo   [1] Production Build Server (vite preview)
echo   [2] Development Server      (vite dev with HMR live reload)
echo   [3] Rebuild Production      (npm run build, then preview)
echo   [4] Exit
echo.
choice /c 1234 /m "Select option"
if errorlevel 4 goto do_exit
if errorlevel 3 goto do_rebuild
if errorlevel 2 goto start_dev
if errorlevel 1 goto start_preview

:start_dev
echo.
echo ===================================================
echo      Starting Development Server (vite dev)        
echo ===================================================
echo [INFO] Live reloading and HMR active.
echo [INFO] Port locked to 15000 for Cloudflare tunnel.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm run dev -- --host --port 15000 --open
goto handle_exit

:start_preview
if not exist "dist\index.html" (
    echo.
    echo [INFO] Production build not found in dist\. Building now...
    goto do_rebuild
)
echo.
echo ===================================================
echo   Starting Production Build Server (vite preview)  
echo ===================================================
echo [INFO] Serving optimized production bundle from dist\
echo [INFO] Port locked to 15000 for Cloudflare tunnel.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm run preview -- --host --port 15000 --open
goto handle_exit

:do_rebuild
echo.
echo ===================================================
echo             Building Production Bundle             
echo ===================================================
echo.
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Production build failed.
    pause
    exit /b %ERRORLEVEL%
)
goto start_preview

:handle_exit
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] The server exited with error code %ERRORLEVEL%.
    pause
)
exit /b %ERRORLEVEL%

:do_exit
echo.
echo Exiting Dataview launcher.
exit /b 0
