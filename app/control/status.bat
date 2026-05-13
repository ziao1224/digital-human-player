@echo off
echo ========== Service Status ==========

echo backend (3001):
powershell -Command "try { Invoke-WebRequest 'http://localhost:3001/api/health' -TimeoutSec 3 -UseBasicParsing | Out-Null; Write-Host '  [ON]' } catch { Write-Host '  [OFF]' }"

echo frontend (5173):
powershell -Command "try { Invoke-WebRequest 'http://localhost:5173' -TimeoutSec 3 -UseBasicParsing | Out-Null; Write-Host '  [ON]' } catch { Write-Host '  [OFF]' }"

echo ======================================
pause
