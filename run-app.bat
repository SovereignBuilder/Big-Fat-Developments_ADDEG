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

REM Check if dist exists
if not exist "dist\electron\main.js" (
    echo Building project...
    call npm run build
)

REM Start Electron
echo Starting ADDEG Desktop App...
call npm start
