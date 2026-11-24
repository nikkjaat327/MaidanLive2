!macro customInit
  ; Force-close any running MaidanLive OBS Bridge instance (including tray-minimized copies
  ; or legacy installs in another folder) while preserving %APPDATA%\MaidanLive OBS Bridge\bridge-config.json.
  nsExec::ExecToLog 'taskkill /F /IM "MaidanLive OBS Bridge.exe" /T'
  Sleep 800
!macroend

!macro customInstall
  ; Ensure maidanlive-bridge:// always launches the upgraded executable path.
  DeleteRegKey HKCU "Software\Classes\maidanlive-bridge"
  WriteRegStr HKCU "Software\Classes\maidanlive-bridge" "" "URL:MaidanLive OBS Bridge"
  WriteRegStr HKCU "Software\Classes\maidanlive-bridge" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\maidanlive-bridge\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\maidanlive-bridge\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend
