@echo off
REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Always build to keep dist in sync with src
echo Building project...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed.
    pause
    exit /b 1
)

REM Start Electron
echo Starting ADDEG Desktop App...
call npm start
