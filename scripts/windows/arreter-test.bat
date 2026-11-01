@echo off
cd /d "%~dp0..\.."
taskkill /IM cloudflared.exe /F >nul 2>&1
docker compose stop
echo Services arretes (tunnel compris). Les donnees sont conservees.
pause
