@echo off
rem TowerWhisper on Windows from cmd.exe or a double-click: runs start.ps1 (first free port, banner).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
rem Double-clicked (cmd /c): keep the window open so the link can be read.
echo %cmdcmdline% | find /i "/c" >nul && pause
