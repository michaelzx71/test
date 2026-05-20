@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js LTS first.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Starting supervised production service...
echo.
echo Main app: http://127.0.0.1:7654/
echo Admin:    http://127.0.0.1:7654/superzxy
echo.
if not exist "%~dp0node_modules\adm-zip" (
  echo [INFO] node_modules\adm-zip was not found.
  echo Main app can still start. Admin ZIP hot upgrade needs npm install.
  echo Run npm install on an online machine, then sync the whole new folder to production.
  echo.
)
echo This window keeps the service alive and restarts it after admin code upgrades.
echo Close this window or press Ctrl+C to stop the service.
echo.

node csxt\server\supervisor.mjs

echo.
pause
