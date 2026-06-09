@echo off
setlocal
for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%REPO_ROOT%\scripts\windows\Start-KendallNxtSupervisor.ps1" -RepoRoot "%REPO_ROOT%"
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%REPO_ROOT%\scripts\windows\Start-KendallNxtDashboard.ps1" -RepoRoot "%REPO_ROOT%"
start "Kendall_Nxt Codex" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\scripts\windows\Start-KendallNxtCodex.ps1" -RepoRoot "%REPO_ROOT%"
