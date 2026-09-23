@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  Unlock the Bank Treasury - Windows Install
echo ============================================
echo.

:: --- Node.js -------------------------------------------------------------
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Attempting to install via winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo.
        echo Could not install Node.js automatically.
        echo Please download and install it manually from https://nodejs.org/ then re-run this script.
        pause
        exit /b 1
    )
    echo.
    echo Node.js installed. Please CLOSE this window, open a new terminal
    echo ^(so PATH changes apply^), and re-run install-windows.bat.
    pause
    exit /b 0
) else (
    echo [OK] Node.js found: & node -v
)

:: --- Ollama ----------------------------------------------------------------
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo Ollama not found. Attempting to install via winget...
    winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo.
        echo Could not install Ollama automatically.
        echo Please download and install it manually from https://ollama.com/download then re-run this script.
        pause
        exit /b 1
    )
    echo.
    echo Ollama installed. Please CLOSE this window, open a new terminal
    echo ^(so PATH changes apply^), and re-run install-windows.bat.
    pause
    exit /b 0
) else (
    echo [OK] Ollama found.
)

:: --- Pull default model -----------------------------------------------------
echo.
echo Pulling default model (llama3.2:3b) - this may take a few minutes...
ollama pull llama3.2:3b
if %errorlevel% neq 0 (
    echo.
    echo Failed to pull the model. Make sure Ollama is running ^(check the system
    echo tray icon^) and try again: ollama pull llama3.2:3b
    pause
    exit /b 1
)

:: --- Project dependencies ---------------------------------------------------
echo.
echo Installing project dependencies (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo npm install failed. See the error above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Install complete! Run run-windows.bat to start the game.
echo ============================================
pause
