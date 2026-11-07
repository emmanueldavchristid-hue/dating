@echo off
chcp 65001 >nul
rem Oublie le jeton Expo enregistré : au prochain partager-test.bat, le script demandera un nouveau jeton
rem (par exemple celui d'un compte Expo dédié aux testeurs).
powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('EXPO_TOKEN', $null, 'User')"
echo Jeton Expo oublie. Relance partager-test.bat et colle le jeton du compte a utiliser.
pause
