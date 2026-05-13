@echo off
title Playback Mode

cd /d "%~dp0.."
if errorlevel 1 (echo Failed to change directory && pause && exit /b 1)

echo ============================================
echo   AI Digital Human - Playback Mode
echo ============================================
echo.

echo [check] Node.js...
node --version >nul 2>&1 || (echo   [FAIL] Node.js not found && pause && exit /b 1)
for /f "tokens=*" %%i in ('node --version') do echo   [OK] node %%i

echo.
echo [check] dependencies...

:: Check if vite actually works (not just if node_modules exists)
call npx --no vite --version >nul 2>&1
if errorlevel 1 (
    echo   installing packages...
    call npm install
    if errorlevel 1 (echo   [FAIL] npm install failed && pause && exit /b 1)
)

if not exist "server\node_modules\express\package.json" (
    echo   installing server packages...
    cd server && call npm install && cd ..
    if errorlevel 1 (echo   [FAIL] server npm install failed && pause && exit /b 1)
)
echo   [OK]

echo.
echo [check] .env...
if exist ".env" (echo   [OK]) else (echo   [WARN] .env missing. Copy .env.example to .env)

echo.
echo [start] launching...

start "Backend" cmd /k "cd /d %CD%\server && node index-windows.js"
timeout /t 2 /nobreak >nul

echo ============================================
echo   Running
echo ============================================
echo   http://localhost:5173/player
echo   http://localhost:5173/admin
echo ============================================
echo   Run control\stop.bat to close
echo.

npm run dev
