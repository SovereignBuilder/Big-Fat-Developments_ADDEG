@echo off
REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies.
        pause
        exit /b 1
    )
)

REM Check if dist exists (build if needed)
if not exist "dist\cli.js" (
    echo Building project...
    call npm run build
    if %errorlevel% neq 0 (
        echo Error: Build failed.
        pause
        exit /b 1
    )
)

REM Run the dashboard
echo Starting ADDEG Dashboard...
node dist/cli.js dashboard
pause
