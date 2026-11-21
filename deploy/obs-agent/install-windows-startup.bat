@echo off
setlocal
cd /d "%~dp0"

echo ====================================================================
echo   Install MaidanLive OBS Bridge Auto-Start Shortcut (Windows)
echo ====================================================================
echo.

if not exist "config.json" (
  echo [ERROR] config.json not found in this folder!
  echo Run start-windows-bridge.bat first or download config.json from MaidanLive.
  pause
  exit /b 1
)

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\MaidanLive OBS Bridge.lnk"
set "TARGET_BAT=%~dp0start-windows-bridge.bat"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'MaidanLive Windows Local OBS Bridge'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
  echo [SUCCESS] Added startup shortcut:
  echo   %SHORTCUT_PATH%
  echo MaidanLive OBS Bridge will start automatically when you sign into Windows.
) else (
  echo [ERROR] Failed creating startup shortcut.
)

echo.
pause
