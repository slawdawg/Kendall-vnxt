[CmdletBinding()]
param(
    [string]$RepoRoot,
    [int]$Port = 8000,
    [string]$UvPath = "C:\Users\slaw_dawg\.local\bin\uv.exe"
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$logDir = Join-Path $RepoRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "supervisor.log"

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Add-Content -LiteralPath $logPath -Value "Supervisor already listening on port $Port."
    exit 0
}

Set-Location $RepoRoot

cmd.exe /d /c "`"$UvPath`" run --directory services/supervisor uvicorn supervisor.api.main:app --host 0.0.0.0 --port $Port >> `"$logPath`" 2>&1"
