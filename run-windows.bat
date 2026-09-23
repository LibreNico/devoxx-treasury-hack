@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo  Unlock the Bank Treasury
echo ============================================
echo.

:: --- Make sure Ollama is up -------------------------------------------------
echo Checking Ollama...
curl -s -o nul -w "%%{http_code}" http://localhost:11434/api/version > "%TEMP%\treasury_ollama_check.txt" 2>nul
set /p OLLAMA_STATUS=<"%TEMP%\treasury_ollama_check.txt"
del "%TEMP%\treasury_ollama_check.txt" >nul 2>nul

if not "%OLLAMA_STATUS%"=="200" (
    echo Ollama does not seem to be running yet. Starting it...
    where ollama >nul 2>nul
    if !errorlevel! neq 0 (
        echo.
        echo Ollama was not found on PATH. Please run install-windows.bat first,
        echo or install Ollama from https://ollama.com/download
        pause
        exit /b 1
    )
    start "Ollama" /min ollama serve
    echo Waiting a few seconds for Ollama to come up...
    timeout /t 5 /nobreak >nul
) else (
    echo [OK] Ollama is running.
)

:: --- Start the game server, then open the browser ---------------------------
echo.
echo Starting the game server...
echo ^(Leave this window open. Press Ctrl+C to stop the server.^)
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

call npm start

pause
