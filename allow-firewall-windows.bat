@echo off
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click this file and choose "Run as administrator" to allow phone access on private Wi-Fi.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $name='Nimma Bengaluru HTTPS (Private Wi-Fi)'; Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort '3443-3463' -RemoteAddress LocalSubnet -Profile Private | Out-Null"
if errorlevel 1 (
  echo Could not add the Windows Firewall rule.
  pause
  exit /b 1
)
echo Allowed inbound HTTPS on ports 3443-3463 from this local network on private profiles.
pause
