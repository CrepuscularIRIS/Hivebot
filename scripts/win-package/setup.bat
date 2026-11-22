@echo off
rem setup.bat - one-click: official DS-Bot installer + DSH SuperAgent overlay
rem (Chinese instructions: see README.md. English prompts kept for cmd encoding safety.)
setlocal
echo ============================================
echo  DS-Bot 0.3.8 + DSH SuperAgent - one-click setup
echo ============================================
echo.

if not exist "DS-Bot-0.3.8-win-x64.exe" ( echo [ERROR] DS-Bot-0.3.8-win-x64.exe not found - run this file from the unzipped folder & goto :fail )
if not exist "install.ps1" ( echo [ERROR] install.ps1 not found - run this file from the unzipped folder & goto :fail )

set "APIKEY="
set /p APIKEY=LiteLLM ApiKey (press Enter to skip, set it later): 
if "%APIKEY%"=="" set "APIKEY=%DSH_LITELLM_API_KEY%"

echo.
echo [1/2] Running official DS-Bot installer (follow the wizard)...
"DS-Bot-0.3.8-win-x64.exe"
if errorlevel 1 ( echo [ERROR] official installer failed & goto :fail )

echo.
echo If DS-Bot auto-started, fully QUIT it now (tray icon - Exit),
echo then press any key to continue . . .
pause >nul

echo.
echo [2/2] Installing DSH SuperAgent overlay...
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -ApiKey "%APIKEY%"
if errorlevel 1 ( goto :fail )

echo.
echo DONE. Start DS-Bot - the main bot is now SuperAgent (Chief).
pause
exit /b 0

:fail
echo Setup FAILED. Fix the error above and re-run setup.bat (safe to retry).
pause
exit /b 1
