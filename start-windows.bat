@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node
node -e "const v=process.versions.node.split('.').map(Number);if(v[0]<20||(v[0]===20&&v[1]<19))process.exit(1)"
if errorlevel 1 goto old_node

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo Created .env with the local demo defaults.
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project packages. This needs an internet connection on first run.
  call npm ci
  if errorlevel 1 goto install_failed
)

echo.
echo Starting Nimma Bengaluru. Keep this window open while you use the app.
echo The phone link and QR code will appear here after startup.
echo.
call npm start
set "NB_EXIT=%ERRORLEVEL%"
if not "%NB_EXIT%"=="0" echo Nimma Bengaluru stopped with error code %NB_EXIT%.
echo.
pause
exit /b %NB_EXIT%

:no_node
echo Node.js is not installed. Install Node.js 20.19 or newer, then run this file again.
goto failed

:old_node
echo Node.js 20.19 or newer is required. Install a current LTS release, then run this file again.
goto failed

:install_failed
echo Package installation failed. Check your internet connection and try again.
goto failed

:failed
echo.
pause
exit /b 1
