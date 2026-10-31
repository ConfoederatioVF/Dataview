@echo off
setlocal
set NODE_OPTIONS=--max-old-space-size=16384
title Confoederatio Dataview

:: Change to the directory where this script is located
cd /d "%~dp0"

:: Configure Node.js crash report output in tests\ to detect JS out-of-memory crashes
if not exist "tests\" mkdir "tests"
set "OOM_REPORT_NAME=.oom_report_%RANDOM%_%RANDOM%.json"
set "OOM_REPORT_FILE=%~dp0tests\%OOM_REPORT_NAME%"
set "OOM_REPORT_DIR=%~dp0tests"
set "OOM_REPORT_DIR=%OOM_REPORT_DIR:\=/%"
set NODE_OPTIONS=%NODE_OPTIONS% --report-on-fatalerror --report-uncaught-exception --report-exclude-env --report-exclude-network "--report-dir=%OOM_REPORT_DIR%" --report-filename=%OOM_REPORT_NAME%
set "OPEN_ARG=--open"
set "RESTART_COUNT=0"

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
set "RESTART_TARGET=start_dev"
if exist "%OOM_REPORT_FILE%" del /f /q "%OOM_REPORT_FILE%" >nul 2>&1
echo.
echo ===================================================
echo      Starting Development Server (vite dev)        
echo ===================================================
echo [INFO] Live reloading and HMR active.
echo [INFO] Port locked to 15000 for Cloudflare tunnel.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm run dev -- --host --port 15000 --open
call npm run dev -- --host --port 15000 %OPEN_ARG%
goto handle_exit

:start_preview
if not exist "dist\index.html" (
    echo.
    echo [INFO] Production build not found in dist\. Building now...
    goto do_rebuild
)
set "RESTART_TARGET=start_preview"
if exist "%OOM_REPORT_FILE%" del /f /q "%OOM_REPORT_FILE%" >nul 2>&1
echo.
echo ===================================================
echo   Starting Production Build Server (vite preview)  
echo ===================================================
echo [INFO] Serving optimized production bundle from dist\
echo [INFO] Port locked to 15000 for Cloudflare tunnel.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm run preview -- --host --port 15000 --open
call npm run preview -- --host --port 15000 %OPEN_ARG%
goto handle_exit

:do_rebuild
set "RESTART_TARGET=do_rebuild"
if exist "%OOM_REPORT_FILE%" del /f /q "%OOM_REPORT_FILE%" >nul 2>&1
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
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" (
    if exist "%OOM_REPORT_FILE%" del /f /q "%OOM_REPORT_FILE%" >nul 2>&1
    goto start_preview
)
goto start_preview
call :check_oom %EXIT_CODE%
if "%IS_OOM%"=="1" goto restart_on_oom
echo.
echo [ERROR] Production build failed.
pause
exit /b %EXIT_CODE%

:handle_exit
if %ERRORLEVEL% neq 0 (
set "EXIT_CODE=%ERRORLEVEL%"
call :check_oom %EXIT_CODE%
if "%IS_OOM%"=="1" goto restart_on_oom
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] The server exited with error code %ERRORLEVEL%.
    echo [ERROR] The server exited with error code %EXIT_CODE%.
    pause
)
exit /b %ERRORLEVEL%
exit /b %EXIT_CODE%

:restart_on_oom
set /a RESTART_COUNT+=1
if not "%RESTART_TARGET%"=="do_rebuild" set "OPEN_ARG="
echo.
echo ===================================================
echo [WARN] JavaScript out-of-memory crash detected (exit code %EXIT_CODE%).
echo [INFO] Restarting %RESTART_TARGET% (attempt #%RESTART_COUNT%) in 2 seconds...
echo [INFO] Press Ctrl+C to stop.
echo ===================================================
ping 127.0.0.1 -n 3 >nul
goto %RESTART_TARGET%

:check_oom
set "IS_OOM=0"
set "CHECK_EXIT=%~1"
set "HAD_REPORT=0"
if exist "%OOM_REPORT_FILE%" (
    set "HAD_REPORT=1"
    findstr /i /c:"OOMError" /c:"out of memory" /c:"OutOfMemory" /c:"ERR_WORKER_OUT_OF_MEMORY" /c:"ArrayBuffer allocation failed" "%OOM_REPORT_FILE%" >nul 2>&1
    if not errorlevel 1 set "IS_OOM=1"
    del /f /q "%OOM_REPORT_FILE%" >nul 2>&1
)
if "%CHECK_EXIT%"=="0" (
    set "IS_OOM=0"
    exit /b 0
)
if "%CHECK_EXIT%"=="-1073741510" (
    set "IS_OOM=0"
    exit /b 0
)
if "%CHECK_EXIT%"=="3221225786" (
    set "IS_OOM=0"
    exit /b 0
)
if "%CHECK_EXIT%"=="130" (
    set "IS_OOM=0"
    exit /b 0
)
if "%HAD_REPORT%"=="0" (
    if "%CHECK_EXIT%"=="134" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="-2147483645" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="2147483651" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="-1073741801" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="3221225495" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="-1073740791" set "IS_OOM=1"
    if "%CHECK_EXIT%"=="3221226505" set "IS_OOM=1"
)
exit /b 0

:do_exit
echo.
echo Exiting Dataview launcher.
exit /b 0
