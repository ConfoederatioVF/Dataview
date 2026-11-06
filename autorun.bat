@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Confoederatio Dataview

:: Change to the directory where this script is located
cd /d "%~dp0"

:: Verify Node.js is available
where node >nul 2>&1
if errorlevel 1 (
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
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

set "SUPERVISOR_ARGS=%*"

:supervisor_loop
node --no-warnings "./core/server/AutorunSupervisor.ts" %SUPERVISOR_ARGS%
set "SUPERVISOR_EXIT=%ERRORLEVEL%"

:: Clean intentional exit (0) or explicit Ctrl+C interrupt (130 / -1073741510 / 3221225786)
if "%SUPERVISOR_EXIT%"=="0" exit /b 0
if "%SUPERVISOR_EXIT%"=="130" exit /b 0
if "%SUPERVISOR_EXIT%"=="-1073741510" exit /b 0
if "%SUPERVISOR_EXIT%"=="3221225786" exit /b 0

echo.
echo ===================================================
echo [WARN] Supervisor process exited unexpectedly (code %SUPERVISOR_EXIT%).
echo [INFO] Auto-recovering persistent supervisor in 2 seconds...
echo ===================================================
set "SUPERVISOR_ARGS=--resume"
ping 127.0.0.1 -n 3 >nul
goto supervisor_loop
