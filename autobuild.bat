@echo off
setlocal
set NODE_OPTIONS=--max-old-space-size=16384
title Project 1436 - Dataview Distribution Builder

cd /d "%~dp0"

echo ===================================================
echo        Dataview Distribution Builder (Build)       
echo ===================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo [INFO] Building production distribution bundle...
echo.

call npm run build

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed with exit code %ERRORLEVEL%.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo [SUCCESS] Distribution bundle built in dist\
echo ===================================================
echo.
if /i not "%~1"=="--no-pause" (
    pause
)
exit /b 0
