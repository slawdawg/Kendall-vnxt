[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$DashboardUrl = "http://127.0.0.1:3000",
    [string]$SupervisorUrl = "http://127.0.0.1:8000",
    [switch]$SkipEndpointChecks,
    [switch]$WriteReport,
    [string]$ReportPath
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$script:checks = New-Object System.Collections.Generic.List[object]
$script:failures = New-Object System.Collections.Generic.List[string]
$script:warnings = New-Object System.Collections.Generic.List[string]

function Add-Check {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )
    $script:checks.Add([ordered]@{
        name = $Name
        status = $Status
        detail = $Detail
    }) | Out-Null
    if ($Status -eq "failed") {
        $script:failures.Add($Detail) | Out-Null
    } elseif ($Status -eq "warning") {
        $script:warnings.Add($Detail) | Out-Null
    }
}

function Test-RequiredScript {
    param([string]$RelativePath)
    $path = Join-Path $resolvedRepoRoot $RelativePath
    if (Test-Path -LiteralPath $path) {
        Add-Check "script:$RelativePath" "passed" "$RelativePath exists."
    } else {
        Add-Check "script:$RelativePath" "failed" "$RelativePath is missing."
    }
}

function Test-StartupTask {
    param(
        [string]$TaskName,
        [string]$ExpectedScript
    )

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Add-Check "task:$TaskName" "failed" "Scheduled task '$TaskName' is not registered."
        return
    }

    $action = $task.Actions | Select-Object -First 1
    $arguments = if ($action) { [string]$action.Arguments } else { "" }
    if (-not $action -or $action.Execute -notmatch "powershell(\.exe)?$") {
        Add-Check "task:$TaskName" "failed" "Scheduled task '$TaskName' does not launch PowerShell."
        return
    }

    if ($arguments -notlike "*$ExpectedScript*" -or $arguments -notlike "*$resolvedRepoRoot*") {
        Add-Check "task:$TaskName" "failed" "Scheduled task '$TaskName' does not point at $ExpectedScript under $resolvedRepoRoot."
        return
    }

    if ($task.Triggers.Count -lt 1 -or $task.Triggers[0].CimClass.CimClassName -notmatch "Logon") {
        Add-Check "task:$TaskName" "failed" "Scheduled task '$TaskName' does not have a logon trigger."
        return
    }

    Add-Check "task:$TaskName" "passed" "Scheduled task '$TaskName' is registered for logon and points at this repo."
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            Add-Check "endpoint:$Name" "passed" "$Name responded with HTTP $($response.StatusCode) at $Url."
        } else {
            Add-Check "endpoint:$Name" "failed" "$Name responded with HTTP $($response.StatusCode) at $Url."
        }
    } catch {
        Add-Check "endpoint:$Name" "failed" "$Name did not respond at ${Url}: $($_.Exception.Message)"
    }
}

Test-RequiredScript "scripts\windows\Install-KendallNxtStartup.ps1"
Test-RequiredScript "scripts\windows\Start-KendallNxtDashboard.ps1"
Test-RequiredScript "scripts\windows\Start-KendallNxtSupervisor.ps1"
Test-RequiredScript "scripts\windows\Start-KendallNxtCodex.ps1"

if ($env:OS -eq "Windows_NT") {
    Test-StartupTask "Kendall_Nxt Dashboard" "Start-KendallNxtDashboard.ps1"
    Test-StartupTask "Kendall_Nxt Supervisor" "Start-KendallNxtSupervisor.ps1"
    Test-StartupTask "Kendall_Nxt Codex" "Start-KendallNxtCodex.ps1"
} else {
    Add-Check "platform" "warning" "Scheduled task checks are only available on Windows."
}

if (-not $SkipEndpointChecks) {
    Test-Endpoint "supervisor" "$SupervisorUrl/health"
    Test-Endpoint "dashboard" $DashboardUrl
}

$status = if ($script:failures.Count -eq 0) { "ready" } else { "not-ready" }

if ($WriteReport) {
    if (-not $ReportPath) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $ReportPath = Join-Path $resolvedRepoRoot ".data\startup\startup-readiness-$timestamp.json"
    }
    $reportDirectory = Split-Path -Parent $ReportPath
    if (-not (Test-Path -LiteralPath $reportDirectory)) {
        New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    }
    [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        repoRoot = $resolvedRepoRoot
        status = $status
        dashboardUrl = $DashboardUrl
        supervisorUrl = $SupervisorUrl
        checks = $script:checks
        warnings = $script:warnings
        failures = $script:failures
    } | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportPath -Encoding UTF8
    Write-Host "Startup readiness report written: $ReportPath"
}

foreach ($check in $script:checks) {
    Write-Host "$($check.status): $($check.name) - $($check.detail)"
}

if ($script:failures.Count -gt 0) {
    exit 1
}
