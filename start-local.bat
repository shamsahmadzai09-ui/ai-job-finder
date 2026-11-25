@echo off
setlocal
cd /d "%~dp0"

echo Starting AI Job Finder from:
cd
echo.

if not exist "%~dp0index.html" (
  echo ERROR: index.html was not found beside this launcher.
  echo Please keep start-local.bat inside the main ai-job-finder folder.
  pause
  exit /b 1
)

echo Starting the app on port 8081.
where py >nul 2>nul
if %errorlevel%==0 (
  start "AI Job Finder Server" /D "%~dp0" cmd /k "py -m http.server 8081"
) else (
  start "AI Job Finder Server" /D "%~dp0" cmd /k "python -m http.server 8081"
)

timeout /t 2 /nobreak >nul
start "" "http://localhost:8081"
echo.
echo Keep the AI Job Finder Server terminal window open.
pause
