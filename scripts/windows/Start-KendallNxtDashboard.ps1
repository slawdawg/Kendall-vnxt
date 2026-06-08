[CmdletBinding()]
param(
    [string]$RepoRoot,
    [int]$Port = 3000,
    [string]$PnpmPath = "C:\Users\slaw_dawg\AppData\Roaming\npm\pnpm.cmd"
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$logDir = Join-Path $RepoRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "dashboard.log"
$nextPath = Join-Path $RepoRoot "apps\dashboard\node_modules\.bin\next.cmd"

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Add-Content -LiteralPath $logPath -Value "Dashboard already listening on port $Port."
    exit 0
}

Set-Location $RepoRoot

cmd.exe /d /c "`"$PnpmPath`" run preflight:js >> `"$logPath`" 2>&1"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path (Join-Path $RepoRoot "apps\dashboard\.next\BUILD_ID"))) {
    cmd.exe /d /c "`"$PnpmPath`" run build:dashboard >> `"$logPath`" 2>&1"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Set-Location (Join-Path $RepoRoot "apps\dashboard")
cmd.exe /d /c "`"$nextPath`" start --hostname 0.0.0.0 --port $Port >> `"$logPath`" 2>&1"
