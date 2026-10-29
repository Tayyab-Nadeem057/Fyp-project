# DepGuard Backend Startup Script (PowerShell)
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DepGuard Backend Startup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Find Python
$pythonCmd = $null
foreach ($cmd in @("py", "python", "python3")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd
        break
    }
}
if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found. Install Python 3.10+ from https://www.python.org/" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "Found Python: $pythonCmd" -ForegroundColor Green
& $pythonCmd --version
Write-Host ""

# Install dependencies
Write-Host "Checking dependencies..." -ForegroundColor Yellow
$checkDeps = & $pythonCmd -c "import fastapi, uvicorn" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing required packages..." -ForegroundColor Yellow
    & $pythonCmd -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
        pause
        exit 1
    }
}
Write-Host "Dependencies OK." -ForegroundColor Green
Write-Host ""

Write-Host "Starting DepGuard backend on http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""
& $pythonCmd -m uvicorn app.main:app --host 127.0.0.1 --port 8000
