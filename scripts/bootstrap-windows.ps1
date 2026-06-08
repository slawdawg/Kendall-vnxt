param(
  [switch]$Full,
  [switch]$InstallMissing,
  [switch]$ConfigureGit,
  [switch]$SetupDeps,
  [switch]$VerifyRemote,
  [switch]$RunCheck,
  [switch]$SkipRemote,
  [switch]$LocalOnly,
  [switch]$WriteReport,
  [string]$ReportPath
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if ($LocalOnly) {
  $SkipRemote = $true
  $VerifyRemote = $false
}

if ($Full) {
  $InstallMissing = $true
  $ConfigureGit = $true
  $SetupDeps = $true
  $VerifyRemote = -not $SkipRemote
  $RunCheck = $true
  $WriteReport = $true
}

if (-not $ReportPath) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $ReportPath = Join-Path $repoRoot ".data\bootstrap\bootstrap-readiness-$timestamp.json"
}

$script:failures = New-Object System.Collections.Generic.List[string]
$script:warnings = New-Object System.Collections.Generic.List[string]
$script:actions = New-Object System.Collections.Generic.List[string]
$script:commands = New-Object System.Collections.Generic.List[object]
$script:platform = [ordered]@{}
$script:readiness = "not-ready"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Write-Ok($Message) {
  Write-Host "OK: $Message"
}

function Add-Warning($Message) {
  $script:warnings.Add($Message) | Out-Null
  Write-Warning $Message
}

function Add-Failure($Message) {
  $script:failures.Add($Message) | Out-Null
  Write-Host "FAIL: $Message"
}

function Get-CommandPath($Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Get-FirstLine($Command, [string[]]$Arguments) {
  try {
    $output = & $Command @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
      return $null
    }
    return ($output | Select-Object -First 1)
  } catch {
    return $null
  }
}

function Add-CommandRecord($Label, $Command, [string[]]$Arguments, $ExitCode) {
  $script:commands.Add([ordered]@{
    label = $Label
    command = $Command
    arguments = $Arguments
    exitCode = $ExitCode
  }) | Out-Null
}

function Invoke-Checked($Command, [string[]]$Arguments, $Label, $RecoveryHint = "") {
  Write-Step $Label
  & $Command @Arguments
  $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  Add-CommandRecord $Label $Command $Arguments $exitCode
  if ($exitCode -ne 0) {
    $message = "$Label failed with exit code $exitCode."
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    throw $message
  }
}

function Refresh-PathFromRegistry {
  if ($env:OS -ne "Windows_NT") {
    return
  }

  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $combined = @($machinePath, $userPath) -join ";"
  if ($combined) {
    $env:Path = $combined
    Write-Ok "Refreshed PATH from Windows registry."
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
  Refresh-PathFromRegistry
}

function Ensure-Tool($Command, $WingetId, $Name, $VersionArgs = @("--version")) {
  $path = Get-CommandPath $Command
  if ($path) {
    Write-Ok "$Name found at $path"
    $version = Get-FirstLine $Command $VersionArgs
    if ($version) {
      Write-Host $version
    }
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

function Get-MachineSummary {
  $osCaption = $null
  $osVersion = $null
  $manufacturer = $null
  $model = $null
  $memoryGb = $null
  $systemDriveFreeGb = $null
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $osCaption = $os.Caption
    $osVersion = $os.Version
    $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
    $manufacturer = $computer.Manufacturer
    $model = $computer.Model
    $memoryGb = [math]::Round(($computer.TotalPhysicalMemory / 1GB), 1)
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
    $systemDriveFreeGb = [math]::Round(($drive.FreeSpace / 1GB), 1)
  } catch {
    $osCaption = [Environment]::OSVersion.Platform.ToString()
    $osVersion = [Environment]::OSVersion.Version.ToString()
  }

  return [ordered]@{
    os = $osCaption
    osVersion = $osVersion
    manufacturer = $manufacturer
    model = $model
    user = [Environment]::UserName
    computerName = [Environment]::MachineName
    processorArchitecture = $env:PROCESSOR_ARCHITECTURE
    processArchitecture = if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }
    memoryGb = $memoryGb
    systemDriveFreeGb = $systemDriveFreeGb
    powershellVersion = $PSVersionTable.PSVersion.ToString()
    executionPolicy = (Get-ExecutionPolicy)
  }
}

function Write-EnvironmentSummary {
  $summary = Get-MachineSummary
  Write-Step "Machine summary"
  foreach ($key in $summary.Keys) {
    Write-Host "${key}: $($summary[$key])"
  }
}

function Get-RegistryValue($Path, $Name) {
  try {
    $item = Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop
    return $item.$Name
  } catch {
    return $null
  }
}

function Test-PlatformPosture {
  Write-Step "Check Windows and VMware posture"
  $summary = Get-MachineSummary

  if ($summary.os -notmatch "Windows 11") {
    Add-Warning "This bootstrap is tuned for Windows 11. Detected: $($summary.os) $($summary.osVersion)."
  }

  if ($summary.processArchitecture -ne "x64") {
    Add-Failure "Bootstrap must run in a 64-bit PowerShell process. Detected $($summary.processArchitecture)."
  }

  if ($summary.memoryGb -ne $null) {
    if ($summary.memoryGb -lt 8) {
      Add-Warning "VM memory is $($summary.memoryGb) GB. Builds/tests may be unstable below 8 GB; 16 GB+ is preferred."
    } elseif ($summary.memoryGb -lt 16) {
      Add-Warning "VM memory is $($summary.memoryGb) GB. 16 GB+ is preferred for comfortable Next.js and pytest runs."
    } else {
      Write-Ok "VM memory looks healthy: $($summary.memoryGb) GB."
    }
  }

  if ($summary.systemDriveFreeGb -ne $null) {
    if ($summary.systemDriveFreeGb -lt 10) {
      Add-Failure "System drive free space is only $($summary.systemDriveFreeGb) GB. Free at least 10 GB before bootstrapping."
    } elseif ($summary.systemDriveFreeGb -lt 25) {
      Add-Warning "System drive free space is $($summary.systemDriveFreeGb) GB. 25 GB+ is preferred for dependency installs and build artifacts."
    } else {
      Write-Ok "System drive free space looks healthy: $($summary.systemDriveFreeGb) GB."
    }
  }

  $isVmware = "$($summary.manufacturer) $($summary.model)" -match "VMware"
  if ($isVmware) {
    Write-Ok "VMware virtual machine detected: $($summary.manufacturer) $($summary.model)."
    $vmTools = Get-Service -Name "VMTools" -ErrorAction SilentlyContinue
    if ($vmTools -and $vmTools.Status -eq "Running") {
      Write-Ok "VMware Tools service is running."
      $script:platform.vmwareTools = "running"
    } elseif ($vmTools) {
      Add-Warning "VMware Tools service exists but is $($vmTools.Status). Start VMware Tools before relying on clipboard/time/display integration."
      $script:platform.vmwareTools = $vmTools.Status.ToString()
    } else {
      Add-Warning "VMware VM detected but VMware Tools service was not found. Install VMware Tools before trusting this VM as a stable work environment."
      $script:platform.vmwareTools = "missing"
    }
  } else {
    Add-Warning "VMware virtual machine was not detected from manufacturer/model. Detected: $($summary.manufacturer) $($summary.model)."
    $script:platform.vmwareTools = "not-detected"
  }

  $longPaths = Get-RegistryValue "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled"
  if ($longPaths -eq 1) {
    Write-Ok "Windows long paths are enabled."
  } else {
    Add-Warning "Windows long paths are not enabled. Node workspaces can hit path-length issues on fresh Windows installs."
  }

  $developerMode = Get-RegistryValue "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" "AllowDevelopmentWithoutDevLicense"
  if ($developerMode -eq 1) {
    Write-Ok "Windows Developer Mode is enabled."
  } else {
    Add-Warning "Windows Developer Mode is not enabled. Some developer tooling may have reduced symlink support."
  }

  $script:platform.windowsLongPathsEnabled = $longPaths
  $script:platform.developerModeEnabled = $developerMode
}

function Test-SupportedNode {
  $nodeVersion = Get-FirstLine "node" @("--version")
  if (-not $nodeVersion) {
    return
  }

  $major = [int](($nodeVersion -replace "^v", "").Split(".")[0])
  if ($major -lt 22 -or $major -gt 24) {
    Add-Failure "Node $nodeVersion is outside the supported workspace range. Use Node 22, 23, or 24."
  }
}

function Test-GitPosture {
  if (-not (Get-CommandPath "git")) {
    return
  }

  Write-Step "Check Git posture"
  $userName = Get-FirstLine "git" @("config", "--get", "user.name")
  $userEmail = Get-FirstLine "git" @("config", "--get", "user.email")
  $longPaths = Get-FirstLine "git" @("config", "--get", "core.longpaths")

  if ($userName) {
    Write-Ok "Git user.name is configured."
  } else {
    Add-Warning "Git user.name is not configured. Commits may fail or use an unexpected identity."
  }

  if ($userEmail) {
    Write-Ok "Git user.email is configured."
  } else {
    Add-Warning "Git user.email is not configured. Commits may fail or use an unexpected identity."
  }

  if ($longPaths -eq "true") {
    Write-Ok "Git core.longpaths is enabled."
  } else {
    Add-Warning "Git core.longpaths is not enabled. Run with -ConfigureGit to set it for this user."
  }
}

function Test-PythonEnvironment {
  if (-not (Get-CommandPath "uv")) {
    return
  }

  Write-Step "Check supervisor Python runtime"
  & uv run --directory services/supervisor python --version
  $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  Add-CommandRecord "Check supervisor Python runtime" "uv" @("run", "--directory", "services/supervisor", "python", "--version") $exitCode
  if ($exitCode -ne 0) {
    throw "Supervisor Python runtime check failed with exit code $exitCode. Run `uv sync --directory services/supervisor`, then retry."
  }
}

function Test-GhPosture {
  $ghPath = Get-CommandPath "gh"
  if (-not $ghPath) {
    return
  }

  Write-Step "Check GitHub CLI posture"
  & cmd /c "gh auth status >nul 2>nul"
  $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  Add-CommandRecord "Check GitHub CLI auth status" "gh" @("auth", "status") $exitCode
  if ($exitCode -eq 0) {
    Add-Warning "GitHub CLI auth is present. This is optional for Kendall_Nxt; avoid persistent insecure-storage tokens."
  } else {
    Write-Ok "GitHub CLI is not authenticated; connector-backed Codex workflows can still use the GitHub app."
  }

  $hostsPath = Join-Path $env:APPDATA "GitHub CLI\hosts.yml"
  if (Test-Path -LiteralPath $hostsPath) {
    $hostsItem = Get-Item -LiteralPath $hostsPath
    if ($hostsItem.Length -gt 100) {
      Add-Warning "GitHub CLI hosts.yml exists and is non-empty. Treat it as sensitive if gh auth is configured."
    } else {
      Write-Ok "GitHub CLI hosts.yml is absent or metadata-only."
    }
  }
}

function Test-NetworkPosture {
  Write-Step "Check network posture for GitHub"

  try {
    $dns = Resolve-DnsName github.com -ErrorAction Stop | Select-Object -First 1
    if ($dns) {
      Write-Ok "DNS resolves github.com."
    }
  } catch {
    Add-Warning "DNS could not resolve github.com before remote checks: $($_.Exception.Message)"
  }

  if (Get-CommandPath "Test-NetConnection") {
    $test = Test-NetConnection github.com -Port 443 -InformationLevel Quiet
    if ($test) {
      Write-Ok "TCP 443 connectivity to github.com is available."
    } else {
      Add-Warning "TCP 443 connectivity to github.com failed. Remote checks may fail for network reasons."
    }
  }
}

function Test-RequiredPath($RelativePath, $Label) {
  $path = Join-Path $repoRoot $RelativePath
  if (Test-Path -LiteralPath $path) {
    Write-Ok "$Label found: $RelativePath"
    return
  }

  Add-Failure "$Label is missing: $RelativePath"
}

function Test-BmadMethod {
  Write-Step "Check BMAD method and required modules"

  $requiredPaths = @(
    @{ path = "_bmad\config.yaml"; label = "BMAD project config" },
    @{ path = "_bmad\config.user.yaml"; label = "BMAD user config" },
    @{ path = "_bmad\core"; label = "BMAD core module" },
    @{ path = "_bmad\bmb"; label = "BMAD module-builder runtime module" },
    @{ path = "_bmad\bmm"; label = "BMAD method manager runtime module" },
    @{ path = "_bmad\tea"; label = "BMAD TEA runtime module" },
    @{ path = "_bmad\module-help.csv"; label = "BMAD module help registry" },
    @{ path = ".agents\skills\bmad-brainstorming\SKILL.md"; label = "BMAD brainstorming skill" },
    @{ path = ".agents\skills\bmad-create-story\SKILL.md"; label = "BMAD create-story skill" },
    @{ path = ".agents\skills\bmad-dev-story\SKILL.md"; label = "BMAD dev-story skill" },
    @{ path = ".agents\skills\bmad-module-builder\SKILL.md"; label = "BMAD module-builder skill" },
    @{ path = ".agents\skills\bmad-agent-analyst\SKILL.md"; label = "BMAD analyst agent skill" },
    @{ path = ".agents\skills\bmad-agent-architect\SKILL.md"; label = "BMAD architect agent skill" },
    @{ path = ".agents\skills\bmad-agent-dev\SKILL.md"; label = "BMAD dev agent skill" },
    @{ path = ".agents\skills\bmad-agent-pm\SKILL.md"; label = "BMAD PM agent skill" },
    @{ path = ".agents\skills\knx-setup\SKILL.md"; label = "KNX setup module" },
    @{ path = ".agents\skills\knx-agent-governance-coordinator\SKILL.md"; label = "KNX governance coordinator" },
    @{ path = ".agents\skills\knx-data-boundary-plan\SKILL.md"; label = "KNX data-boundary module" },
    @{ path = ".agents\skills\knx-execution-policy\SKILL.md"; label = "KNX execution-policy module" },
    @{ path = ".agents\skills\knx-mature-tool-review\SKILL.md"; label = "KNX mature-tool module" },
    @{ path = ".agents\skills\knx-module-strategy\SKILL.md"; label = "KNX module-strategy module" },
    @{ path = ".agents\skills\knx-profile-setup\SKILL.md"; label = "KNX profile-setup module" },
    @{ path = ".agents\skills\knx-safety-validation-review\SKILL.md"; label = "KNX safety-validation module" },
    @{ path = ".agents\skills\knx-source-evidence-contract\SKILL.md"; label = "KNX source-evidence contract module" },
    @{ path = ".agents\skills\knx-source-evidence-validator\SKILL.md"; label = "KNX source-evidence validator module" }
  )

  foreach ($entry in $requiredPaths) {
    Test-RequiredPath $entry.path $entry.label
  }

  if ($script:failures.Count -eq 0) {
    $script:actions.Add("Verified BMAD method and required KNX modules are installed.") | Out-Null
  }
}

function Write-ReadinessReport {
  if (-not $WriteReport) {
    return
  }

  $reportDirectory = Split-Path -Parent $ReportPath
  if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
  }

  $toolVersions = [ordered]@{
    git = Get-FirstLine "git" @("--version")
    node = Get-FirstLine "node" @("--version")
    pnpm = Get-FirstLine "pnpm" @("--version")
    uv = Get-FirstLine "uv" @("--version")
    gh = Get-FirstLine "gh" @("--version")
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    repoRoot = $repoRoot.Path
    readiness = $script:readiness
    mode = if ($Full) { "full" } elseif ($LocalOnly) { "local-only" } else { "diagnostic/custom" }
    machine = Get-MachineSummary
    platform = $script:platform
    toolVersions = $toolVersions
    actions = $script:actions
    warnings = $script:warnings
    failures = $script:failures
    commands = $script:commands
    requiredModules = @(
      "bmad-method",
      "bmad-brainstorming",
      "bmad-create-story",
      "bmad-dev-story",
      "bmad-module-builder",
      "knx-setup",
      "knx-agent-governance-coordinator",
      "knx-data-boundary-plan",
      "knx-execution-policy",
      "knx-mature-tool-review",
      "knx-module-strategy",
      "knx-profile-setup",
      "knx-safety-validation-review",
      "knx-source-evidence-contract",
      "knx-source-evidence-validator"
    )
    authPolicy = "Git Credential Manager with DPAPI for Git remotes; GitHub connector/app for Codex PR automation; local gh auth optional only for workflows that shell out to gh."
  }

  $report | ConvertTo-Json -Depth 8 | Set-Content -Path $ReportPath -Encoding UTF8
  Write-Host ""
  Write-Host "Readiness report written: $ReportPath"
}

try {
  Write-Host "Kendall_Nxt Windows bootstrap"
  Write-Host "Repo: $repoRoot"
  Write-Host "Mode: $(if ($Full) { "full" } elseif ($LocalOnly) { "local-only" } else { "diagnostic/custom" })"
  Write-Host "GitHub CLI auth is optional. This bootstrap does not create a gh token."

  Write-EnvironmentSummary
  Test-PlatformPosture

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
    Test-SupportedNode
    Write-Step "Check Corepack and pnpm"
    $corepack = Get-CommandPath "corepack"
    if (-not $corepack) {
      Add-Failure "corepack is missing even though Node.js is present. Repair Node.js, then rerun."
    } else {
      if ($SetupDeps -or $Full) {
        Invoke-Checked "corepack" @("enable") "Enable Corepack"
        Invoke-Checked "corepack" @("prepare", "pnpm@11.5.2", "--activate") "Activate pnpm 11.5.2"
        Refresh-PathFromRegistry
      }

      if (Get-CommandPath "pnpm") {
        Write-Ok "pnpm is available."
        pnpm --version
      } else {
        Add-Failure "pnpm is not available. Run corepack enable, then retry from a new PowerShell session."
      }
    }
  }

  if ($ConfigureGit -and $gitOk) {
    Write-Step "Configure secure Git credential defaults"
    $helpers = @(& git config --get-all credential.helper 2>$null)
    if ($helpers -match "^manager$") {
      Write-Ok "Git Credential Manager helper is already configured."
    } else {
      Invoke-Checked "git" @("config", "--global", "credential.helper", "manager") "Set Git Credential Manager helper"
    }

    $credentialStore = Get-FirstLine "git" @("config", "--global", "--get", "credential.credentialStore")
    if ($credentialStore -eq "dpapi") {
      Write-Ok "GCM credentialStore is already dpapi."
    } else {
      Invoke-Checked "git" @("config", "--global", "credential.credentialStore", "dpapi") "Set GCM credentialStore to dpapi"
    }

    $gitLongPaths = Get-FirstLine "git" @("config", "--global", "--get", "core.longpaths")
    if ($gitLongPaths -eq "true") {
      Write-Ok "Git long path support is already enabled."
    } else {
      Invoke-Checked "git" @("config", "--global", "core.longpaths", "true") "Set Git long path support"
    }
    $script:actions.Add("Configured Git Credential Manager with Windows DPAPI.") | Out-Null
  }

  Test-GitPosture

  if ($gitOk) {
    Write-Step "Check repository and branch"
    Invoke-Checked "git" @("rev-parse", "--is-inside-work-tree") "Verify Git work tree"
    git status --short --branch
  }

  Test-BmadMethod
  if ($script:failures.Count -gt 0) {
    throw "BMAD method/module requirement check failed. Restore tracked BMAD and KNX module files, then rerun bootstrap."
  }

  if ($SetupDeps) {
    Write-Step "Install workspace dependencies"
    Invoke-Checked "pnpm" @("install") "Install pnpm workspace dependencies"
    Invoke-Checked "uv" @("sync", "--directory", "services/supervisor") "Sync supervisor Python virtualenv"
    $script:actions.Add("Installed JavaScript dependencies and synced supervisor virtualenv.") | Out-Null
  }

  Test-PythonEnvironment
  Test-GhPosture

  Write-Step "Run local preflight"
  Invoke-Checked "pnpm" @("run", "preflight") "Run workspace preflight"
  $script:readiness = "local-ready"

  Write-Step "Run GitHub sync doctor"
  if ($VerifyRemote -and -not $SkipRemote) {
    Test-NetworkPosture
    if ($env:OS -eq "Windows_NT" -and $gitOk) {
      Invoke-Checked "git" @("credential-manager", "diagnose") "Verify Git Credential Manager before live remote checks" "Run from a visible interactive Windows session after signing into the VM if DPAPI reports Access is denied."
    }
    Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs", "--remote") "Run live GitHub remote doctor" "This proves Git/GCM remote readiness; GitHub CLI auth is intentionally optional."
    $script:readiness = "remote-ready"
  } else {
    Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs") "Run non-network GitHub doctor"
  }

  if ($RunCheck) {
    Invoke-Checked "pnpm" @("run", "check") "Run full workspace check"
    $script:actions.Add("Ran full workspace check.") | Out-Null
  }

  Write-Step "Summary"
  foreach ($action in $script:actions) {
    Write-Ok $action
  }

  if ($script:warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Warnings:"
    foreach ($warning in $script:warnings) {
      Write-Host "- $warning"
    }
  }

  if ($script:failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Failures:"
    foreach ($failure in $script:failures) {
      Write-Host "- $failure"
    }
    exit 1
  }

  Write-Host ""
  if ($script:readiness -eq "remote-ready") {
    Write-Host "Bootstrap complete. This VM is ready for Kendall_Nxt work, including live Git remote checks."
  } else {
    Write-Host "Bootstrap complete. This VM is ready for local Kendall_Nxt work. Live Git remote checks were not proven in this run."
  }
  Write-Host "Codex orientation handoff: docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md"
} catch {
  Add-Failure $_.Exception.Message
  Write-Host ""
  Write-Host "Bootstrap stopped before reaching full readiness."
  Write-Host $_.Exception.Message
  exit 1
} finally {
  Write-ReadinessReport
}
