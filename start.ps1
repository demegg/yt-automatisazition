# Start ShortForge backend + frontend (run from project root)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting ShortForge..." -ForegroundColor Cyan

# Backend
$backend = Join-Path $root "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backend'; if (-not (Test-Path venv)) { python -m venv venv }; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt -q; uvicorn app.main:app --port 8890 --reload-exclude 'uploads' --reload-exclude 'output'"

Start-Sleep -Seconds 2

# Frontend
$frontend = Join-Path $root "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontend'; npm install; npm run dev"

Write-Host ""
Write-Host "Backend:  http://127.0.0.1:8890" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
