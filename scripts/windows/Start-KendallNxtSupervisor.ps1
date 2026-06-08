[CmdletBinding()]
param(
    [string]$RepoRoot,
    [int]$Port = 8000,
    [string]$UvPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-UvPath {
    param([string]$PreferredPath)

    if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
        return $PreferredPath
    }

    foreach ($name in @("uv.exe", "uv")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    throw "Unable to find uv on PATH."
}

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$logDir = Join-Path $RepoRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "supervisor.log"
$uvExecutable = Resolve-UvPath -PreferredPath $UvPath

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Add-Content -LiteralPath $logPath -Value "Supervisor already listening on port $Port."
    exit 0
}

Set-Location $RepoRoot
& $uvExecutable "run" "--directory" "services/supervisor" "uvicorn" "supervisor.api.main:app" "--host" "0.0.0.0" "--port" "$Port" *>> $logPath
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
