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
set /a SUPERVISOR_RESTARTS=0
set /a MAX_SUPERVISOR_RESTARTS=5

:supervisor_loop
node --no-warnings "./core/server/AutorunSupervisor.ts" %SUPERVISOR_ARGS%
set "SUPERVISOR_EXIT=%ERRORLEVEL%"

:: Only auto-recover on internal supervisor crash (75) or native/V8 crash codes; never resurrect external kills or port conflicts
set "SHOULD_RECOVER=0"
if "%SUPERVISOR_EXIT%"=="75" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="3" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="134" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="139" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="-536870904" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="-1073740791" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="-1073741801" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="-2147483645" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="2147483651" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="3221225495" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="3221226505" set "SHOULD_RECOVER=1"
if "%SUPERVISOR_EXIT%"=="3758096392" set "SHOULD_RECOVER=1"

if "%SHOULD_RECOVER%"=="0" (
    if not "%SUPERVISOR_EXIT%"=="0" (
        if exist "autorun.lock.local" node --no-warnings "./core/server/AutorunSupervisor.ts" --cleanup-orphan >nul 2>&1
    )
    exit /b %SUPERVISOR_EXIT%
)

set /a SUPERVISOR_RESTARTS+=1
if %SUPERVISOR_RESTARTS% GTR %MAX_SUPERVISOR_RESTARTS% (
    echo.
    echo [ERROR] Supervisor exceeded maximum crash recovery attempts ^(%MAX_SUPERVISOR_RESTARTS%^). Stopping.
    if exist "autorun.lock.local" node --no-warnings "./core/server/AutorunSupervisor.ts" --cleanup-orphan >nul 2>&1
    exit /b %SUPERVISOR_EXIT%
)

echo.
echo ===================================================
echo [WARN] Supervisor process exited unexpectedly (code %SUPERVISOR_EXIT%).
echo [INFO] Auto-recovering persistent supervisor (%SUPERVISOR_RESTARTS%/%MAX_SUPERVISOR_RESTARTS%) in 2 seconds...
echo ===================================================
set "SUPERVISOR_ARGS=--resume"
ping 127.0.0.1 -n 3 >nul
goto supervisor_loop
