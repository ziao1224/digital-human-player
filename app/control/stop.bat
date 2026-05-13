@echo off
echo Stopping all digital human services...

powershell -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*node*index-windows*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
powershell -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*node*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul

echo done
