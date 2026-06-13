$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logRoot = Join-Path $repoRoot ".runtime\dashboard"
$logFile = Join-Path $logRoot "dashboard.log"
$errFile = Join-Path $logRoot "dashboard.err.log"

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) Dashboard port 3000 is already listening; startup skipped."
    exit 0
}

$pnpm = Get-Command pnpm.cmd -ErrorAction Stop
Set-Location $repoRoot

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Executable,
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,
        [Parameter(Mandatory = $true)]
        [string] $StdoutPath,
        [Parameter(Mandatory = $true)]
        [string] $StderrPath
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Executable @Arguments 1>> $StdoutPath 2>> $StderrPath
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

Add-Content -Path $logFile -Value "$(Get-Date -Format o) Building Kendall dashboard."
$buildExitCode = Invoke-NativeCommand -Executable $pnpm.Source -Arguments @("--filter", "@kendall/dashboard", "build") -StdoutPath $logFile -StderrPath $errFile
if ($buildExitCode -ne 0) {
    Add-Content -Path $errFile -Value "$(Get-Date -Format o) Dashboard build failed with exit code $buildExitCode."
    exit $buildExitCode
}

Add-Content -Path $logFile -Value "$(Get-Date -Format o) Starting Kendall dashboard on 0.0.0.0:3000."
$startExitCode = Invoke-NativeCommand -Executable $pnpm.Source -Arguments @("--filter", "@kendall/dashboard", "start") -StdoutPath $logFile -StderrPath $errFile
if ($startExitCode -ne 0) {
    Add-Content -Path $errFile -Value "$(Get-Date -Format o) Dashboard start failed with exit code $startExitCode."
    exit $startExitCode
}
