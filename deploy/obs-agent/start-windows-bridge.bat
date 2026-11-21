@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ====================================================================
echo   MaidanLive Windows Local OBS Bridge (OBS WebSocket v5 on 4455)
echo ====================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 18+ is not installed or not in PATH.
  echo Download and install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] Installing bridge dependencies for the first time...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

if exist "config.json" (
  echo [BRIDGE] Found config.json - connecting outbound to MaidanLive and local OBS...
  echo [INFO] Press Ctrl+C anytime to stop the bridge cleanly.
  echo.
  node maidanlive-obs-agent.mjs --config config.json
) else (
  echo [SETUP] config.json not found. First-time Bridge Setup Wizard:
  echo   1. Open MaidanLive Broadcast Studio -^> Tab "OBS Connection & Agent"
  echo   2. Click "Register Windows Bridge" to get your Bridge ID and Bridge Token
  echo   3. You can also download config.json directly into this folder and re-run!
  echo.
  set /p ML_SERVER="MaidanLive Server URL (e.g. https://maidanlive.example.com): "
  set /p ML_BRIDGE="Bridge ID (e.g. ML-BRG-XXXXXX): "
  set /p ML_TOKEN="Bridge Token: "
  set /p OBS_PWD="OBS WebSocket Password (port 4455, leave blank if disabled): "
  set /p BRG_LABEL="PC Label (optional, e.g. Ground-Laptop-1): "
  if "!BRG_LABEL!"=="" set BRG_LABEL=Windows-OBS-PC

  powershell -NoProfile -Command "$cfg = @{ serverUrl = $env:ML_SERVER; bridgeId = $env:ML_BRIDGE; bridgeToken = $env:ML_TOKEN; obsUrl = 'ws://127.0.0.1:4455'; obsPassword = $env:OBS_PWD; label = $env:BRG_LABEL }; $cfg | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 'config.json'"

  if exist "config.json" (
    echo.
    echo [SETUP] Saved local credentials to config.json ^(stored only on this PC^).
    echo [BRIDGE] Starting bridge...
    echo.
    node maidanlive-obs-agent.mjs --config config.json
  ) else (
    echo [WARN] Could not save config.json, launching directly...
    node maidanlive-obs-agent.mjs --server "!ML_SERVER!" --bridge "!ML_BRIDGE!" --token "!ML_TOKEN!" --obs-password "!OBS_PWD!" --label "!BRG_LABEL!"
  )
)

echo.
echo [BRIDGE] Bridge stopped. Press any key to close.
pause
