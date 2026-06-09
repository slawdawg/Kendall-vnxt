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

function Get-ExistingToolDirectoryCandidates {
  $candidates = @(
    "C:\Program Files\Git\cmd",
    "C:\Program Files\Git\bin",
    "C:\Program Files (x86)\Git\cmd",
    (Join-Path $env:USERPROFILE ".local\bin"),
    (Join-Path $env:USERPROFILE ".cargo\bin"),
    (Join-Path $env:LOCALAPPDATA "nvm"),
    "C:\nvm4w\nodejs"
  )

  return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
}

function Add-PathEntryIfMissing([System.Collections.Generic.List[string]]$Entries, [string]$Entry) {
  if (-not $Entry) {
    return
  }

  $normalizedEntry = $Entry.Trim().TrimEnd("\")
  foreach ($existing in $Entries) {
    if ($existing.Trim().TrimEnd("\").Equals($normalizedEntry, [StringComparison]::OrdinalIgnoreCase)) {
      return
    }
  }

  $Entries.Add($Entry) | Out-Null
}

function Get-CommandPath($Name) {
  if ($env:OS -eq "Windows_NT") {
    $extension = [IO.Path]::GetExtension($Name)
    if (-not $extension) {
      foreach ($candidateName in @("$Name.cmd", "$Name.exe")) {
        $candidateCommand = Get-Command $candidateName -ErrorAction SilentlyContinue
        if ($candidateCommand) {
          return $candidateCommand.Source
        }
      }
    }

    $directCandidates = switch ($Name) {
      "git" {
        @(
          "C:\Program Files\Git\cmd\git.exe",
          "C:\Program Files\Git\bin\git.exe",
          "C:\Program Files (x86)\Git\cmd\git.exe"
        )
      }
      "uv" {
        @(
          (Join-Path $env:USERPROFILE ".local\bin\uv.exe"),
          (Join-Path $env:USERPROFILE ".cargo\bin\uv.exe")
        )
      }
      default { @() }
    }

    foreach ($candidate in $directCandidates) {
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        return $candidate
      }
    }
  }

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Get-FirstLine($Command, [string[]]$Arguments) {
  if (-not $Command) {
    return $null
  }

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

function Test-IsAdministrator {
  if ($env:OS -ne "Windows_NT") {
    return $false
  }

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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
  try {
    & $Command @Arguments
    $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  } catch {
    $exitCode = -1
    Add-CommandRecord $Label $Command $Arguments $exitCode
    $message = "$Label failed before completion: $($_.Exception.Message)"
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    throw $message
  }

  Add-CommandRecord $Label $Command $Arguments $exitCode
  if ($exitCode -ne 0) {
    $message = "$Label failed with exit code $exitCode."
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    throw $message
  }
}

function Invoke-Recorded($Command, [string[]]$Arguments, $Label, $RecoveryHint = "", [switch]$FailureAsWarning) {
  Write-Step $Label
  try {
    & $Command @Arguments | ForEach-Object { Write-Host $_ }
    $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  } catch {
    $exitCode = -1
    Add-CommandRecord $Label $Command $Arguments $exitCode
    $message = "$Label failed before completion: $($_.Exception.Message)"
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    if ($FailureAsWarning) {
      Add-Warning $message
    } else {
      Add-Failure $message
    }
    return $false
  }

  Add-CommandRecord $Label $Command $Arguments $exitCode
  if ($exitCode -ne 0) {
    $message = "$Label failed with exit code $exitCode."
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    if ($FailureAsWarning) {
      Add-Warning $message
    } else {
      Add-Failure $message
    }
    return $false
  }

  return $true
}

function Refresh-PathFromRegistry {
  if ($env:OS -ne "Windows_NT") {
    return
  }

  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $pathEntries = New-Object System.Collections.Generic.List[string]

  foreach ($candidate in (Get-ExistingToolDirectoryCandidates)) {
    Add-PathEntryIfMissing $pathEntries $candidate
  }

  foreach ($pathBlock in @($env:Path, $machinePath, $userPath)) {
    if (-not $pathBlock) {
      continue
    }

    foreach ($entry in ($pathBlock -split ";")) {
      Add-PathEntryIfMissing $pathEntries $entry
    }
  }

  if ($pathEntries.Count -gt 0) {
    $env:Path = ($pathEntries -join ";")
    Write-Ok "Refreshed PATH from Windows registry and known tool locations."
  }
}

function Ensure-UserPathContainsKnownTools {
  if ($env:OS -ne "Windows_NT") {
    return
  }

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $userEntries = New-Object System.Collections.Generic.List[string]
  if ($userPath) {
    foreach ($entry in ($userPath -split ";")) {
      Add-PathEntryIfMissing $userEntries $entry
    }
  }

  $changed = $false
  foreach ($candidate in (Get-ExistingToolDirectoryCandidates)) {
    $before = $userEntries.Count
    Add-PathEntryIfMissing $userEntries $candidate
    if ($userEntries.Count -gt $before) {
      $changed = $true
    }
  }

  if ($changed) {
    [Environment]::SetEnvironmentVariable("Path", ($userEntries -join ";"), "User")
    Refresh-PathFromRegistry
    Write-Ok "Persisted known developer tool directories to the user PATH."
    $script:actions.Add("Persisted Git, uv, NVM, and Node shim directories to the user PATH when present.") | Out-Null
  }
}

function Ensure-PowerShellCanRunLocalShims {
  if ($env:OS -ne "Windows_NT") {
    return
  }

  $machinePolicy = Get-ExecutionPolicy -Scope MachinePolicy
  $userPolicy = Get-ExecutionPolicy -Scope UserPolicy
  if ($machinePolicy -ne "Undefined" -or $userPolicy -ne "Undefined") {
    Add-Warning "PowerShell execution policy is controlled by Group Policy. If pnpm/npm .ps1 shims are blocked, ask an administrator to allow RemoteSigned for developer shells."
    return
  }

  $currentUserPolicy = Get-ExecutionPolicy -Scope CurrentUser
  if ($currentUserPolicy -in @("RemoteSigned", "Unrestricted", "Bypass")) {
    Write-Ok "PowerShell CurrentUser execution policy allows local Node tool shims."
    return
  }

  try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    Write-Ok "Set PowerShell CurrentUser execution policy to RemoteSigned for local Node tool shims."
    $script:actions.Add("Set PowerShell CurrentUser execution policy to RemoteSigned for pnpm/npm/Corepack shims.") | Out-Null
  } catch {
    Add-Warning "Could not set PowerShell CurrentUser execution policy to RemoteSigned: $($_.Exception.Message)"
  }
}

function Enable-ModernTls {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
  } catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  }
}

function Get-BootstrapDownloadDirectory {
  $path = Join-Path $repoRoot ".data\bootstrap\downloads"
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
  return $path
}

function Invoke-Download($Uri, $OutputPath, $Label) {
  Write-Step $Label
  Enable-ModernTls
  try {
    Invoke-WebRequest -Uri $Uri -OutFile $OutputPath -UseBasicParsing
    Add-CommandRecord $Label "Invoke-WebRequest" @($Uri, $OutputPath) 0
    Write-Ok "Downloaded $Uri"
    return $true
  } catch {
    Add-CommandRecord $Label "Invoke-WebRequest" @($Uri, $OutputPath) -1
    Add-Warning "$Label failed: $($_.Exception.Message)"
    return $false
  }
}

function Invoke-Process($FilePath, [string[]]$Arguments, $Label, $RecoveryHint = "") {
  Write-Step $Label
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden
    $exitCode = if ($process.ExitCode -eq $null) { 0 } else { $process.ExitCode }
  } catch {
    $exitCode = -1
    Add-CommandRecord $Label $FilePath $Arguments $exitCode
    $message = "$Label failed before completion: $($_.Exception.Message)"
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    Add-Warning $message
    return $false
  }

  Add-CommandRecord $Label $FilePath $Arguments $exitCode
  if ($exitCode -ne 0) {
    $message = "$Label failed with exit code $exitCode."
    if ($RecoveryHint) {
      $message = "$message $RecoveryHint"
    }
    Add-Warning $message
    return $false
  }

  return $true
}

function Install-GitDirect {
  Write-Step "Resolve latest Git for Windows installer"
  Enable-ModernTls
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers @{ "User-Agent" = "Kendall_Nxt bootstrap" }
    $asset = $release.assets | Where-Object { $_.name -match "^Git-.*-64-bit\.exe$" } | Select-Object -First 1
  } catch {
    Add-Warning "Could not query latest Git for Windows release: $($_.Exception.Message)"
    return $false
  }

  if (-not $asset) {
    Add-Warning "Could not find a 64-bit Git for Windows installer asset in the latest release."
    return $false
  }

  $installer = Join-Path (Get-BootstrapDownloadDirectory) $asset.name
  if (-not (Invoke-Download $asset.browser_download_url $installer "Download Git for Windows installer")) {
    return $false
  }

  $installed = Invoke-Process $installer @(
    "/VERYSILENT",
    "/NORESTART",
    "/NOCANCEL",
    "/SP-",
    "/CLOSEAPPLICATIONS",
    "/RESTARTAPPLICATIONS"
  ) "Install Git for Windows directly" "Install Git manually from https://gitforwindows.org/ if the silent installer fails."

  if ($installed) {
    Refresh-PathFromRegistry
    $script:actions.Add("Installed Git for Windows from direct release fallback.") | Out-Null
  }

  return $installed
}

function Install-NodeDirect {
  Write-Step "Resolve latest Node.js 24 x64 MSI"
  Enable-ModernTls
  try {
    $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $releases | Where-Object { $_.version -match "^v24\." -and $_.files -contains "win-x64-msi" } | Select-Object -First 1
  } catch {
    Add-Warning "Could not query Node.js release index: $($_.Exception.Message)"
    return $false
  }

  if (-not $release) {
    Add-Warning "Could not find a Node.js 24 Windows x64 MSI in the Node.js release index."
    return $false
  }

  $fileName = "node-$($release.version)-x64.msi"
  $uri = "https://nodejs.org/dist/$($release.version)/$fileName"
  $installer = Join-Path (Get-BootstrapDownloadDirectory) $fileName
  if (-not (Invoke-Download $uri $installer "Download Node.js 24 x64 MSI")) {
    return $false
  }

  $installed = Invoke-Process "msiexec.exe" @(
    "/i",
    $installer,
    "/qn",
    "/norestart"
  ) "Install Node.js 24 directly" "Install Node.js 24 LTS manually from https://nodejs.org/ if the MSI install fails."

  if ($installed) {
    Refresh-PathFromRegistry
    $script:actions.Add("Installed Node.js 24 from direct MSI fallback.") | Out-Null
  }

  return $installed
}

function Get-NvmPath {
  $nvm = Get-CommandPath "nvm"
  if ($nvm) {
    return $nvm
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "nvm\nvm.exe"),
    "C:\nvm4w\nvm.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Get-LatestNode24Version {
  Enable-ModernTls
  try {
    $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $releases | Where-Object { $_.version -match "^v24\." -and $_.files -contains "win-x64-msi" } | Select-Object -First 1
  } catch {
    Add-Warning "Could not query Node.js release index: $($_.Exception.Message)"
    return $null
  }

  if (-not $release) {
    Add-Warning "Could not find a Node.js 24 Windows x64 release in the Node.js release index."
    return $null
  }

  return $release.version
}

function Install-NodeWithNvm($Version) {
  $nvm = Get-NvmPath
  if (-not $nvm) {
    return $false
  }

  $nvmVersion = $Version -replace "^v", ""
  $installed = Invoke-Recorded $nvm @("install", $nvmVersion) "Install Node.js $nvmVersion with NVM" "" -FailureAsWarning
  if (-not $installed) {
    return $false
  }

  $selected = Invoke-Recorded $nvm @("use", $nvmVersion) "Select Node.js $nvmVersion with NVM" "" -FailureAsWarning
  if (-not $selected) {
    return $false
  }

  Refresh-PathFromRegistry
  $script:actions.Add("Installed and selected Node.js $nvmVersion with NVM.") | Out-Null
  return $true
}

function Install-SupportedNode {
  $version = Get-LatestNode24Version
  if (-not $version) {
    return $false
  }

  if (Install-NodeWithNvm $version) {
    return $true
  }

  return (Install-NodeDirect)
}

function Install-UvDirect {
  $installer = Join-Path (Get-BootstrapDownloadDirectory) "uv-install.ps1"
  if (-not (Invoke-Download "https://astral.sh/uv/install.ps1" $installer "Download uv installer")) {
    return $false
  }

  $installed = Invoke-Process "powershell.exe" @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $installer
  ) "Install uv directly" "Install uv manually from https://docs.astral.sh/uv/ if the installer fails."

  if ($installed) {
    Refresh-PathFromRegistry
    Ensure-UserPathContainsKnownTools
    $script:actions.Add("Installed uv from direct installer fallback.") | Out-Null
  }

  return $installed
}

function Install-CodexCli {
  $npm = Get-CommandPath "npm.cmd"
  if (-not $npm) {
    Add-Warning "npm.cmd is not available, so Codex CLI cannot be installed with npm."
    return $false
  }

  $installed = Invoke-Recorded $npm @(
    "install",
    "-g",
    "@openai/codex"
  ) "Install Codex CLI with npm" "Install Codex CLI manually with `npm install -g @openai/codex` if this fails."

  if ($installed) {
    Refresh-PathFromRegistry
    $script:actions.Add("Installed Codex CLI with npm.") | Out-Null
  }

  return $installed
}

function Test-CodexCli {
  $codex = Get-CodexCliPath
  if (-not $codex) {
    return $false
  }

  Write-Ok "Codex CLI found at $codex"
  $version = Get-FirstLine $codex @("--version")
  if ($version) {
    Write-Host $version
    return $true
  }

  Add-Warning "Codex command exists at $codex but `codex --version` did not run successfully."
  return $false
}

function Get-CodexCliPath {
  if ($env:OS -eq "Windows_NT") {
    $codexCmd = Get-CommandPath "codex.cmd"
    if ($codexCmd) {
      return $codexCmd
    }
  }

  return (Get-CommandPath "codex")
}

function Ensure-CodexCli {
  if (Test-CodexCli) {
    return $true
  }

  if ($InstallMissing) {
    if (Install-CodexCli -and (Test-CodexCli)) {
      return $true
    }
  }

  Add-Failure "Codex CLI is missing or not runnable. Install it with `npm install -g @openai/codex`, then rerun bootstrap."
  return $false
}

function Update-WingetDirect {
  Write-Step "Resolve latest App Installer / winget MSIX bundle"
  Enable-ModernTls
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/microsoft/winget-cli/releases/latest" -Headers @{ "User-Agent" = "Kendall_Nxt bootstrap" }
    $asset = $release.assets | Where-Object { $_.name -match "^Microsoft\.DesktopAppInstaller_.*\.msixbundle$" } | Select-Object -First 1
  } catch {
    Add-Warning "Could not query latest winget-cli release: $($_.Exception.Message)"
    return $false
  }

  if (-not $asset) {
    Add-Warning "Could not find App Installer MSIX bundle in latest winget-cli release."
    return $false
  }

  $bundle = Join-Path (Get-BootstrapDownloadDirectory) $asset.name
  if (-not (Invoke-Download $asset.browser_download_url $bundle "Download App Installer / winget MSIX bundle")) {
    return $false
  }

  $installed = Invoke-Process "powershell.exe" @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Add-AppxPackage -Path `"$bundle`""
  ) "Install App Installer / winget directly from MSIX bundle" "If this fails, update App Installer manually from Microsoft Store."

  if ($installed) {
    Refresh-PathFromRegistry
    $script:actions.Add("Updated App Installer / winget from direct MSIX bundle fallback.") | Out-Null
  }

  return $installed
}

function Update-Winget {
  $winget = Get-CommandPath "winget"
  if (-not $winget) {
    Add-Warning "winget is not available, so App Installer cannot be updated automatically."
    return $false
  }

  Write-Host ""
  Write-Host "winget path: $winget"
  $wingetVersion = Get-FirstLine $winget @("--version")
  if ($wingetVersion) {
    Write-Host "winget version before update: $wingetVersion"
  }

  $updated = Invoke-Recorded $winget @(
    "upgrade",
    "Microsoft.AppInstaller",
    "--accept-package-agreements",
    "--accept-source-agreements"
  ) "Update App Installer / winget" "" -FailureAsWarning

  if (-not $updated) {
    $updated = Invoke-Recorded $winget @(
      "upgrade",
      "--id", "Microsoft.AppInstaller",
      "--exact",
      "--source", "msstore",
      "--accept-package-agreements",
      "--accept-source-agreements"
    ) "Retry App Installer / winget update from Microsoft Store" "If winget still crashes, update App Installer from Microsoft Store manually before rerunning bootstrap." -FailureAsWarning
  }

  if (-not $updated) {
    $updated = Invoke-Recorded $winget @(
      "install",
      "--id", "9NBLGGH4NNS1",
      "--exact",
      "--source", "msstore",
      "--accept-package-agreements",
      "--accept-source-agreements"
    ) "Install/update App Installer from Microsoft Store product id" "If winget still cannot update App Installer, open Microsoft Store and update App Installer manually before rerunning bootstrap." -FailureAsWarning
  }

  if (-not $updated) {
    $updated = Update-WingetDirect
  }

  if ($updated) {
    Refresh-PathFromRegistry
    $wingetVersion = Get-FirstLine "winget" @("--version")
    if ($wingetVersion) {
      Write-Host "winget version after update: $wingetVersion"
    }
    $script:actions.Add("Updated App Installer / winget or confirmed no winget update was needed.") | Out-Null
  }

  return $updated
}

function Install-WithWinget($Id, $Name) {
  $winget = Get-CommandPath "winget"
  if (-not $winget) {
    Add-Failure "winget is not available. Install $Name manually, then rerun this script."
    return $false
  }

  $installArguments = @(
    "install",
    "--id", $Id,
    "--exact",
    "--source", "winget",
    "--accept-package-agreements",
    "--accept-source-agreements"
  )

  $installed = Invoke-Recorded $winget $installArguments "Install $Name with winget" "" -FailureAsWarning
  if (-not $installed) {
    Add-Warning "Retrying $Name install after resetting winget sources."
    if (Test-IsAdministrator) {
      Invoke-Recorded $winget @("source", "reset", "--force") "Reset winget sources" "" -FailureAsWarning | Out-Null
    } else {
      Add-Warning "Skipping winget source reset because this PowerShell session is not elevated."
    }
    Invoke-Recorded $winget @("source", "update") "Update winget sources" "" -FailureAsWarning | Out-Null
    $installed = Invoke-Recorded $winget $installArguments "Retry install $Name with winget" "If winget still crashes, bootstrap will try a direct installer fallback when one is available." -FailureAsWarning
  }

  if (-not $installed) {
    return $false
  }

  Refresh-PathFromRegistry
  return $true
}

function Ensure-Tool($Command, $WingetId, $Name, $VersionArgs = @("--version"), [scriptblock]$FallbackInstaller = $null) {
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
    $installed = Install-WithWinget $WingetId $Name
    if (-not $installed -and $FallbackInstaller) {
      Add-Warning "Trying direct installer fallback for $Name."
      $installed = & $FallbackInstaller
    }

    if (-not $installed) {
      Add-Failure "$Name could not be installed automatically. Install it manually, then rerun bootstrap."
      return $false
    }

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

function Test-SupportedNode([switch]$Failure) {
  $nodeVersion = Get-FirstLine "node" @("--version")
  if (-not $nodeVersion) {
    return $false
  }

  $major = [int](($nodeVersion -replace "^v", "").Split(".")[0])
  if ($major -lt 22 -or $major -gt 24) {
    $message = "Node $nodeVersion is outside the supported workspace range. Use Node 22, 23, or 24."
    if ($Failure) {
      Add-Failure $message
    } else {
      Add-Warning $message
    }
    return $false
  }

  return $true
}

function Ensure-SupportedNode {
  $nodeOk = Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js" @("--version") { Install-SupportedNode }
  if (-not $nodeOk) {
    return $false
  }

  if (Test-SupportedNode) {
    return $true
  }

  if ($InstallMissing) {
    Add-Warning "Attempting to install supported Node.js 24 because the active Node.js version is outside the workspace range."
    if (Install-SupportedNode) {
      Refresh-PathFromRegistry
      return (Test-SupportedNode)
    }
  }

  Test-SupportedNode -Failure | Out-Null
  return $false
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
  $uv = Get-CommandPath "uv"
  if (-not $uv) {
    return
  }

  Write-Step "Check supervisor Python runtime"
  & $uv run --directory services/supervisor python --version
  $exitCode = if ($LASTEXITCODE -eq $null) { 0 } else { $LASTEXITCODE }
  Add-CommandRecord "Check supervisor Python runtime" $uv @("run", "--directory", "services/supervisor", "python", "--version") $exitCode
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

function Get-BmadDefaultSetting($Name, $DefaultValue) {
  $legacyConfigPaths = @(
    "_bmad\bmm\config.yaml",
    "_bmad\core\config.yaml",
    "_bmad\bmb\config.yaml",
    "_bmad\tea\config.yaml"
  )

  foreach ($relativePath in $legacyConfigPaths) {
    $path = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    $match = Select-String -Path $path -Pattern "^$([regex]::Escape($Name)):\s*(.+)$" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) {
      return ($match.Matches[0].Groups[1].Value.Trim().Trim("'").Trim('"'))
    }
  }

  return $DefaultValue
}

function Ensure-BmadUserConfig {
  $path = Join-Path $repoRoot "_bmad\config.user.yaml"
  if (Test-Path -LiteralPath $path) {
    return
  }

  $userName = Get-BmadDefaultSetting "user_name" "BMad"
  $communicationLanguage = Get-BmadDefaultSetting "communication_language" "English"
  $content = @(
    "# Local/user-specific BMAD configuration generated by bootstrap-windows.ps1.",
    "# This file is intentionally gitignored.",
    "user_name: $userName",
    "communication_language: $communicationLanguage"
  )

  Set-Content -Path $path -Value $content -Encoding UTF8
  Write-Ok "Created local BMAD user config: _bmad\config.user.yaml"
  $script:actions.Add("Created local BMAD user config from existing BMAD defaults.") | Out-Null
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
    git = Get-FirstLine (Get-CommandPath "git") @("--version")
    node = Get-FirstLine (Get-CommandPath "node") @("--version")
    pnpm = Get-FirstLine (Get-CommandPath "pnpm") @("--version")
    uv = Get-FirstLine (Get-CommandPath "uv") @("--version")
    codex = Get-FirstLine (Get-CodexCliPath) @("--version")
    gh = Get-FirstLine (Get-CommandPath "gh") @("--version")
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
  Refresh-PathFromRegistry
  Ensure-UserPathContainsKnownTools
  Ensure-PowerShellCanRunLocalShims

  if ($InstallMissing) {
    Update-Winget | Out-Null
    Ensure-UserPathContainsKnownTools
    Ensure-PowerShellCanRunLocalShims
  }

  Write-Step "Check required tools"
  $gitOk = Ensure-Tool "git" "Git.Git" "Git" @("--version") { Install-GitDirect }
  $nodeOk = Ensure-SupportedNode
  $uvOk = Ensure-Tool "uv" "Astral.UV" "uv" @("--version") { Install-UvDirect }
  $codexOk = Ensure-CodexCli
  $pnpmOk = $false
  $gitCommand = Get-CommandPath "git"
  $uvCommand = Get-CommandPath "uv"
  $pnpmCommand = $null

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
        Invoke-Checked $corepack @("enable") "Enable Corepack"
        Invoke-Checked $corepack @("prepare", "pnpm@11.5.2", "--activate") "Activate pnpm 11.5.2"
        Refresh-PathFromRegistry
        Ensure-UserPathContainsKnownTools
      }

      $pnpmCommand = Get-CommandPath "pnpm"
      if ($pnpmCommand) {
        Write-Ok "pnpm is available."
        & $pnpmCommand --version
        $pnpmOk = $true
      } else {
        Add-Failure "pnpm is not available. Run corepack enable, then retry from a new PowerShell session."
      }
    }
  }

  if ($ConfigureGit -and $gitOk) {
    Write-Step "Configure secure Git credential defaults"
    $helpers = @(& $gitCommand config --get-all credential.helper 2>$null)
    if ($helpers -match "^manager$") {
      Write-Ok "Git Credential Manager helper is already configured."
    } else {
      Invoke-Checked $gitCommand @("config", "--global", "credential.helper", "manager") "Set Git Credential Manager helper"
    }

    $credentialStore = Get-FirstLine $gitCommand @("config", "--global", "--get", "credential.credentialStore")
    if ($credentialStore -eq "dpapi") {
      Write-Ok "GCM credentialStore is already dpapi."
    } else {
      Invoke-Checked $gitCommand @("config", "--global", "credential.credentialStore", "dpapi") "Set GCM credentialStore to dpapi"
    }

    $gitLongPaths = Get-FirstLine $gitCommand @("config", "--global", "--get", "core.longpaths")
    if ($gitLongPaths -eq "true") {
      Write-Ok "Git long path support is already enabled."
    } else {
      Invoke-Checked $gitCommand @("config", "--global", "core.longpaths", "true") "Set Git long path support"
    }
    $script:actions.Add("Configured Git Credential Manager with Windows DPAPI.") | Out-Null
  }

  Test-GitPosture

  if ($gitOk) {
    Write-Step "Check repository and branch"
    Invoke-Checked $gitCommand @("rev-parse", "--is-inside-work-tree") "Verify Git work tree"
    & $gitCommand status --short --branch
  }

  Ensure-BmadUserConfig
  $failureCountBeforeBmad = $script:failures.Count
  Test-BmadMethod
  if ($script:failures.Count -gt $failureCountBeforeBmad) {
    throw "BMAD method/module requirement check failed. Restore tracked BMAD and KNX module files, then rerun bootstrap."
  }

  if ($SetupDeps) {
    Write-Step "Install workspace dependencies"
    if ($pnpmOk -and $uvOk) {
      Invoke-Checked $pnpmCommand @("install") "Install pnpm workspace dependencies"
      Invoke-Checked $uvCommand @("sync", "--directory", "services/supervisor") "Sync supervisor Python virtualenv"
      $script:actions.Add("Installed JavaScript dependencies and synced supervisor virtualenv.") | Out-Null
    } else {
      Add-Failure "Cannot install workspace dependencies until pnpm and uv are available."
    }
  }

  Test-PythonEnvironment
  Test-GhPosture

  if ($pnpmOk) {
    Write-Step "Run local preflight"
    Invoke-Checked $pnpmCommand @("run", "preflight") "Run workspace preflight"
    $script:readiness = "local-ready"
  } else {
    Add-Failure "Cannot run workspace preflight until pnpm is available."
  }

  if ($nodeOk -and ($gitOk -or (-not $VerifyRemote -or $SkipRemote))) {
    Write-Step "Run GitHub sync doctor"
    if ($VerifyRemote -and -not $SkipRemote) {
      Test-NetworkPosture
      if ($env:OS -eq "Windows_NT" -and $gitOk) {
        Invoke-Checked $gitCommand @("credential-manager", "diagnose") "Verify Git Credential Manager before live remote checks" "Run from a visible interactive Windows session after signing into the VM if DPAPI reports Access is denied."
      } elseif ($env:OS -eq "Windows_NT") {
        Add-Failure "Cannot verify Git Credential Manager before live remote checks until Git is available."
      }
      Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs", "--remote") "Run live GitHub remote doctor" "This proves Git/GCM remote readiness; GitHub CLI auth is intentionally optional."
      $script:readiness = "remote-ready"
    } else {
      if ($gitOk) {
        Invoke-Checked "node" @("./scripts/github-sync-doctor.mjs") "Run non-network GitHub doctor"
      } else {
        Add-Failure "Cannot run non-network GitHub doctor until Git is available."
      }
    }
  } else {
    if (-not $nodeOk) {
      Add-Failure "Cannot run GitHub sync doctor until Node.js is available."
    } elseif (-not $gitOk) {
      Add-Failure "Cannot run GitHub sync doctor until Git is available."
    }
  }

  if ($RunCheck) {
    if ($pnpmOk) {
      Invoke-Checked $pnpmCommand @("run", "check") "Run full workspace check"
      $script:actions.Add("Ran full workspace check.") | Out-Null
    } else {
      Add-Failure "Cannot run full workspace check until pnpm is available."
    }
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
  Write-Host "Codex orientation handoff: docs/handoffs/current.md"
  Write-Host "Fresh VM acceptance checklist: docs/fresh-vm-acceptance-checklist.md"
} catch {
  Add-Failure $_.Exception.Message
  Write-Host ""
  Write-Host "Bootstrap stopped before reaching full readiness."
  Write-Host $_.Exception.Message
  exit 1
} finally {
  Write-ReadinessReport
}
