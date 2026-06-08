[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$UserName = $env:USERNAME
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$dashboardScript = Join-Path $RepoRoot "scripts\windows\Start-KendallNxtDashboard.ps1"
$supervisorScript = Join-Path $RepoRoot "scripts\windows\Start-KendallNxtSupervisor.ps1"

foreach ($path in @($dashboardScript, $supervisorScript)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing startup script: $path"
    }
}

$principal = New-ScheduledTaskPrincipal -UserId $UserName -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserName

$dashboardAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dashboardScript`" -RepoRoot `"$RepoRoot`""
$supervisorAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisorScript`" -RepoRoot `"$RepoRoot`""

Register-ScheduledTask `
    -TaskName "Kendall_Nxt Dashboard" `
    -Action $dashboardAction `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force `
    -Description "Starts the Kendall_Nxt dashboard on Windows logon."

Register-ScheduledTask `
    -TaskName "Kendall_Nxt Supervisor" `
    -Action $supervisorAction `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force `
    -Description "Starts the Kendall_Nxt supervisor API on Windows logon."
