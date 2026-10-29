@echo off
title DepGuard Backend
echo ============================================
echo   DepGuard Backend Startup
echo ============================================
echo.

REM Try to find Python
where py >nul 2>&1
if %errorlevel%==0 (
    set PYTHON_CMD=py
    goto :found
)
where python >nul 2>&1
if %errorlevel%==0 (
    set PYTHON_CMD=python
    goto :found
)
echo ERROR: Python is not installed or not in PATH.
echo Please install Python 3.10+ from https://www.python.org/downloads/
echo Make sure to check "Add Python to PATH" during installation.
pause
exit /b 1

:found
echo Found Python: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

REM Install dependencies if needed
echo Checking dependencies...
%PYTHON_CMD% -c "import fastapi, uvicorn" 2>nul
if %errorlevel% neq 0 (
    echo Installing required packages...
    %PYTHON_CMD% -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
)
echo Dependencies OK.
echo.

echo Starting DepGuard backend on http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.
%PYTHON_CMD% -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
