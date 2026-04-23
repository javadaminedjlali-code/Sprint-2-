@echo off
REM Sprint 2 Course Registration System - Windows launcher
REM Double-click this file to install dependencies (first run only) and start the server.

title Sprint 2 Course Registration
cd /d "%~dp0backend"

echo ================================================================
echo   Sprint 2 - Course Registration System
echo ================================================================
echo.

REM Check Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo.
  echo Please install the LTS version from https://nodejs.org
  echo then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM Install dependencies if needed (skips if node_modules already exists)
if not exist "node_modules" (
  echo Installing dependencies for the first time...
  echo This takes about 30 seconds. Please wait.
  echo.
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. See messages above.
    pause
    exit /b 1
  )
  echo.
  echo Dependencies installed.
  echo.
)

echo Starting server...
echo.
echo Once you see "Running on http://localhost:3000" below,
echo open that URL in your browser.
echo.
echo Login credentials:
echo   Student:    student1 / password123
echo   Professor:  prof2    / password123
echo.
echo Press Ctrl+C in this window to stop the server.
echo ================================================================
echo.

REM Open the browser after a short delay so the server has time to start
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

REM Start server (blocks until Ctrl+C)
call npm.cmd start

pause
