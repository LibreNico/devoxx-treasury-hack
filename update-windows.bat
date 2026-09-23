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

:: If this folder was set up via GitHub's "Download ZIP" instead of git clone,
:: there's no .git here yet and "git pull" fails with "fatal: not a git
:: repository". Adopt the folder in place so future updates work normally.
if not exist ".git" (
    echo This folder isn't a git checkout yet ^(likely set up via GitHub's
    echo "Download ZIP" instead of git clone^). Converting it in place...
    echo.
    git init -q
    git symbolic-ref HEAD refs/heads/main
    git remote add origin https://github.com/LibreNico/devoxx-treasury-hack.git
    git fetch origin
    if !errorlevel! neq 0 (
        echo.
        echo Could not reach GitHub. Check the internet connection and try again.
        pause
        exit /b 1
    )
    echo Syncing files to match the latest version on GitHub...
    git reset --hard origin/main
    git branch -u origin/main main
    echo.
    echo This folder is now a proper git checkout, in sync with GitHub.
    echo.
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
