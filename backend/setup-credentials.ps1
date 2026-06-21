# Opens developer portals and shows exactly what to copy into backend\.env
$envFile = Join-Path $PSScriptRoot ".env"

Write-Host ""
Write-Host "ShortForge — API credential setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "I can't log into Google/TikTok for you, but this script opens the right pages." -ForegroundColor Gray
Write-Host ""

Write-Host "STEP 1 — YouTube (about 5 min)" -ForegroundColor Yellow
Write-Host "  1. Enable YouTube Data API v3"
Write-Host "  2. Create OAuth client (Web application)"
Write-Host "  3. Authorized redirect URIs — add BOTH (copy exactly):" -ForegroundColor White
Write-Host "     http://127.0.0.1:8890/api/social/youtube/callback" -ForegroundColor Green
Write-Host "     http://localhost:8890/api/social/youtube/callback" -ForegroundColor Green
Write-Host "  4. OAuth consent screen → add yourself as a Test user (required while app is in Testing)"
Write-Host "     Use the same Google account you sign in with (e.g. your@gmail.com)" -ForegroundColor Gray
Write-Host "  5. Copy Client ID and Client Secret into .env"
Write-Host ""
Start-Process "https://console.cloud.google.com/apis/library/youtube.googleapis.com"
Start-Sleep -Seconds 2
Start-Process "https://console.cloud.google.com/apis/credentials"

Read-Host "Press Enter when you have pasted GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET into .env"

Write-Host ""
Write-Host "STEP 2 — TikTok (may need app review)" -ForegroundColor Yellow
Write-Host "  1. Create an app, add Login Kit + Content Posting API"
Write-Host "  2. Redirect URI — add BOTH in TikTok app settings:" -ForegroundColor White
Write-Host "     http://127.0.0.1:8890/api/social/tiktok/callback" -ForegroundColor Green
Write-Host "     http://localhost:8890/api/social/tiktok/callback" -ForegroundColor Green
Write-Host "  3. Copy Client key and Client secret into .env"
Write-Host ""
Start-Process "https://developers.tiktok.com/apps/"

Read-Host "Press Enter when done (or skip TikTok for now)"

Write-Host ""
Write-Host "Restart the backend:" -ForegroundColor Cyan
Write-Host "  cd backend"
Write-Host "  .\venv\Scripts\uvicorn app.main:app --port 8890"
Write-Host ""
Write-Host ".env location: $envFile" -ForegroundColor Gray
