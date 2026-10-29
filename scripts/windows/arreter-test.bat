@echo off
cd /d "%~dp0..\.."
docker compose stop
echo Services arretes. Les donnees sont conservees (relancer avec demarrer-test.bat).
pause
