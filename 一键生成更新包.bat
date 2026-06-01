@echo off
setlocal
cd /d "%~dp0"
node scripts\build-update-package.mjs
echo.
pause
