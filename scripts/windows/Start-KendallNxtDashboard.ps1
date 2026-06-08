[CmdletBinding()]
param(
    [string]$RepoRoot,
    [int]$Port = 3000,
    [string]$PnpmPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-PnpmCommand {
    param([string]$PreferredPath)

    if ($PreferredPath -and (Test-Path -LiteralPath $PreferredPath)) {
        return @{ Path = $PreferredPath; PrefixArgs = @() }
    }

    foreach ($name in @("pnpm.cmd", "pnpm")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return @{ Path = $command.Source; PrefixArgs = @() }
        }
    }

    foreach ($name in @("corepack.cmd", "corepack")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return @{ Path = $command.Source; PrefixArgs = @("pnpm") }
        }
    }

    throw "Unable to find pnpm or corepack on PATH."
}

function Invoke-LoggedExternal {
    param(
        [hashtable]$Command,
        [string[]]$Arguments,
        [string]$LogPath
    )

    & $Command.Path @($Command.PrefixArgs + $Arguments) *>> $LogPath
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$logDir = Join-Path $RepoRoot ".data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "dashboard.log"
$nextPath = Join-Path $RepoRoot "apps\dashboard\node_modules\.bin\next.cmd"
$pnpmCommand = Resolve-PnpmCommand -PreferredPath $PnpmPath

if (-not (Test-Path -LiteralPath $nextPath)) {
    throw "Missing dashboard start command: $nextPath"
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Add-Content -LiteralPath $logPath -Value "Dashboard already listening on port $Port."
    exit 0
}

Set-Location $RepoRoot
Invoke-LoggedExternal -Command $pnpmCommand -Arguments @("run", "preflight:js") -LogPath $logPath

if (-not (Test-Path (Join-Path $RepoRoot "apps\dashboard\.next\BUILD_ID"))) {
    Invoke-LoggedExternal -Command $pnpmCommand -Arguments @("run", "build:dashboard") -LogPath $logPath
}

Set-Location (Join-Path $RepoRoot "apps\dashboard")
& $nextPath "start" "--hostname" "0.0.0.0" "--port" "$Port" *>> $logPath
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
