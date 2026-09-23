@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Unlock the Bank Treasury - Reset local data
echo ============================================
echo.
echo This WIPES this laptop's sessions/leaderboard data.
echo Make sure you've already exported it if you need it:
echo   curl http://localhost:3000/api/export ^> results.json
echo.
set /p CONFIRM=Type YES to wipe this laptop's data:

if not "%CONFIRM%"=="YES" (
    echo.
    echo Cancelled -- nothing was changed.
    pause
    exit /b 0
)

echo.
call npm run reset-db
if %errorlevel% neq 0 (
    echo.
    echo reset-db failed. See the error above.
    pause
    exit /b 1
)

echo.
echo Done. This laptop's data has been reset.
pause
