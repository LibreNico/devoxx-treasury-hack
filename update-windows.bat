@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  Unlock the Bank Treasury - Update
echo ============================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Git was not found on PATH. Re-run install-windows.bat to install it,
    echo or install manually from https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Bail out if there are local edits, instead of clobbering them.
git status --porcelain > "%TEMP%\treasury_git_status.txt"
for %%A in ("%TEMP%\treasury_git_status.txt") do set STATUS_SIZE=%%~zA
del "%TEMP%\treasury_git_status.txt" >nul 2>nul
if not "%STATUS_SIZE%"=="0" (
    echo This copy has local changes that don't match the repo.
    echo Please ask whoever set up the booth laptops before updating, so
    echo their changes aren't lost.
    pause
    exit /b 1
)

echo Pulling latest changes...
git pull
if %errorlevel% neq 0 (
    echo.
    echo git pull failed. See the error above.
    pause
    exit /b 1
)

echo.
echo Re-installing dependencies in case they changed...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo npm install failed. See the error above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Update complete! Run run-windows.bat to start the game.
echo ============================================
pause
