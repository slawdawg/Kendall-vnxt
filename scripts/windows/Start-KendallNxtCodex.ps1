[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$CodexPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-CodexPath {
    param([string]$PreferredPath)

    if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
        return $PreferredPath
    }

    foreach ($name in @("codex.cmd", "codex.exe", "codex")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    throw "Unable to find Codex on PATH. Install it with: npm install -g @openai/codex"
}

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$logDir = Join-Path $RepoRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "codex.log"
$codexExecutable = Resolve-CodexPath -PreferredPath $CodexPath

$mutex = New-Object System.Threading.Mutex($false, "KendallNxtCodexCli")
if (-not $mutex.WaitOne(0)) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Codex is already running for this Windows session."
    exit 0
}

try {
    Set-Location $RepoRoot
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Starting Codex from $RepoRoot using $codexExecutable."
    Write-Host "Starting Codex from $RepoRoot"
    Write-Host "Orientation handoff: docs/handoffs/current.md"
    Write-Host ""
    & $codexExecutable
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Codex exited with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
