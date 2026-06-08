param(
  [switch]$Full,
  [switch]$InstallMissing,
  [switch]$ConfigureGit,
  [switch]$SetupDeps,
  [switch]$VerifyRemote,
  [switch]$RunCheck,
  [switch]$SkipRemote
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if ($Full) {
  $InstallMissing = $true
  $ConfigureGit = $true
  $SetupDeps = $true
  $VerifyRemote = -not $SkipRemote
  $RunCheck = $true
}

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$actions = New-Object System.Collections.Generic.List[string]

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Write-Ok($Message) {
  Write-Host "OK: $Message"
}

function Add-Warning($Message) {
  $warnings.Add($Message) | Out-Null
  Write-Warning $Message
}

function Add-Failure($Message) {
  $failures.Add($Message) | Out-Null
  Write-Error $Message -ErrorAction Continue
}

function Get-CommandPath($Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Invoke-Checked($Command, [string[]]$Arguments, $Label) {
  Write-Step $Label
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Install-WithWinget($Id, $Name) {
  $winget = Get-CommandPath "winget"
  if (-not $winget) {
    Add-Failure "winget is not available. Install $Name manually, then rerun this script."
    return
  }

  Invoke-Checked $winget @(
    "install",
    "--id", $Id,
    "--exact",
    "--accept-package-agreements",
    "--accept-source-agreements"
  ) "Install $Name with winget"
}

function Ensure-Tool($Command, $WingetId, $Name, $VersionArgs = @("--version")) {
  $path = Get-CommandPath $Command
  if ($path) {
    Write-Ok "$Name found at $path"
    & $Command @VersionArgs | Select-Object -First 1
    return $true
  }

  if ($InstallMissing) {
    Install-WithWinget $WingetId $Name
    $path = Get-CommandPath $Command
    if ($path) {
      Write-Ok "$Name installed at $path"
      return $true
    }
  }

  Add-Failure "$Name is missing. Install it or rerun with -InstallMissing or -Full."
  return $false
}

Write-Host "Kendall_Nxt Windows bootstrap"
Write-Host "Repo: $repoRoot"
Write-Host "Mode: $(if ($Full) { "full" } else { "diagnostic/custom" })"
Write-Host "GitHub CLI auth is optional. This bootstrap does not create a gh token."

Write-Step "Check required tools"
$gitOk = Ensure-Tool "git" "Git.Git" "Git"
$nodeOk = Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js"
$uvOk = Ensure-Tool "uv" "Astral.UV" "uv"

$ghPath = Get-CommandPath "gh"
if ($ghPath) {
  Write-Ok "GitHub CLI found at $ghPath"
} else {
  Add-Warning "GitHub CLI is not installed. That is acceptable for connector-backed Codex workflows."
}

if ($nodeOk) {
  Write-Step "Check Corepack and pnpm"
  $corepack = Get-CommandPath "corepack"
  if (-not $corepack) {
    Add-Failure "corepack is missing even though Node.js is present. Repair Node.js, then rerun."
  } else {
    if ($SetupDeps -or $Full) {
      Invoke-Checked "corepack" @("enable") "Enable Corepack"
      Invoke-Checked "corepack" @("prepare", "pnpm@11.5.2", "--activate") "Activate pnpm 11.5.2"
    }

    if (Get-CommandPath "pnpm") {
      Write-Ok "pnpm is available."
      pnpm --version
    } else {
      Add-Failure "pnpm is not available. Run corepack enable, then rerun."
    }
  }
}

if ($ConfigureGit -and $gitOk) {
  Write-Step "Configure secure Git credential defaults"
  Invoke-Checked "git" @("config", "--global", "credential.helper", "manager") "Set Git Credential Manager helper"
  Invoke-Checked "git" @("config", "--global", "credential.credentialStore", "dpapi") "Set GCM credentialStore to dpapi"
  $actions.Add("Configured Git Credential Manager with Windows DPAPI.") | Out-Null
}

if ($gitOk) {
  Write-Step "Check repository and branch"
  Invoke-Checked "git" @("rev-parse", "--is-inside-work-tree") "Verify Git work tree"
  git status --short --branch
}

if ($SetupDeps) {
  Write-Step "Install workspace dependencies"
  Invoke-Checked "pnpm" @("install") "Install pnpm workspace dependencies"
  Invoke-Checked "uv" @("sync", "--directory", "services/supervisor") "Sync supervisor Python virtualenv"
  $actions.Add("Installed JavaScript dependencies and synced supervisor virtualenv.") | Out-Null
}

Write-Step "Run local preflight"
Invoke-Checked "pnpm" @("run", "preflight") "Run workspace preflight"

Write-Step "Run GitHub sync doctor"
if ($VerifyRemote -and -not $SkipRemote) {
  if ($env:OS -eq "Windows_NT" -and $gitOk) {
    Invoke-Checked "git" @("credential-manager", "diagnose") "Verify Git Credential Manager before live remote checks"
  }
  Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs", "--remote") "Run live GitHub remote doctor"
} else {
  Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs") "Run non-network GitHub doctor"
}

if ($RunCheck) {
  Invoke-Checked "pnpm" @("run", "check") "Run full workspace check"
  $actions.Add("Ran full workspace check.") | Out-Null
}

Write-Step "Summary"
foreach ($action in $actions) {
  Write-Ok $action
}

if ($warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "Warnings:"
  foreach ($warning in $warnings) {
    Write-Host "- $warning"
  }
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Failures:"
  foreach ($failure in $failures) {
    Write-Host "- $failure"
  }
  exit 1
}

Write-Host ""
if ($VerifyRemote -and -not $SkipRemote) {
  Write-Host "Bootstrap complete. This VM is ready for Kendall_Nxt work, including live Git remote checks."
} else {
  Write-Host "Bootstrap complete. This VM is ready for local Kendall_Nxt work. Live Git remote checks were not proven in this run."
}
