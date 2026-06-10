param(
    [switch]$ApplyGitHubProtection,
    [string]$ProtectedBranch = "main",
    [switch]$AllowCodexFullBypass
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Set-OrAppendTomlValue {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $pattern = "(?m)^$([regex]::Escape($Key))\s*=.*$"
    $line = "$Key = $Value"

    if ($Content -match $pattern) {
        return [regex]::Replace($Content, $pattern, $line)
    }

    if ($Content.EndsWith("`n")) {
        return "$Content$line`n"
    }

    return "$Content`n$line`n"
}

function Get-RepoSlug {
    $remoteUrl = git remote get-url origin
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteUrl)) {
        throw "Could not read git remote 'origin'."
    }

    $trimmed = $remoteUrl.Trim()
    if ($trimmed -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(\.git)?$") {
        return "$($Matches.owner)/$($Matches.repo)"
    }

    throw "Remote origin is not a recognizable GitHub URL: $trimmed"
}

$repoRoot = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw "This script must be run from inside a Git worktree."
}
$repoRoot = $repoRoot.Trim()

Write-Step "Updating Codex user config"
$codexConfig = Join-Path $env:USERPROFILE ".codex\config.toml"
$codexConfigDir = Split-Path -Parent $codexConfig
if (-not (Test-Path -LiteralPath $codexConfigDir)) {
    New-Item -ItemType Directory -Path $codexConfigDir | Out-Null
}

if (Test-Path -LiteralPath $codexConfig) {
    $configText = Get-Content -Raw -LiteralPath $codexConfig
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item -LiteralPath $codexConfig -Destination "$codexConfig.bak.$timestamp"
} else {
    $configText = ""
}

if ($AllowCodexFullBypass) {
    $configText = Set-OrAppendTomlValue -Content $configText -Key "sandbox_mode" -Value '"danger-full-access"'
    $configText = Set-OrAppendTomlValue -Content $configText -Key "approval_policy" -Value '"never"'
    $configText = Set-OrAppendTomlValue -Content $configText -Key "approvals_reviewer" -Value '"auto_review"'
} else {
    $configText = Set-OrAppendTomlValue -Content $configText -Key "sandbox_mode" -Value '"danger-full-access"'
    $configText = Set-OrAppendTomlValue -Content $configText -Key "approval_policy" -Value '"on-request"'
    $configText = Set-OrAppendTomlValue -Content $configText -Key "approvals_reviewer" -Value '"auto_review"'
}

Set-Content -LiteralPath $codexConfig -Value $configText -NoNewline
Write-Host "Updated $codexConfig"

Write-Step "Installing local Git pre-push guard"
$hooksDir = Join-Path $repoRoot ".githooks"
if (-not (Test-Path -LiteralPath $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir | Out-Null
}

$prePushPath = Join-Path $hooksDir "pre-push"
$prePushScript = @'
#!/bin/sh
protected_pattern='^(refs/heads/)?(main|master)$'

while read local_ref local_sha remote_ref remote_sha
do
    if echo "$remote_ref" | grep -Eq "$protected_pattern"; then
        echo "Blocked direct push to protected branch: $remote_ref" >&2
        echo "Open a pull request instead." >&2
        exit 1
    fi
done

exit 0
'@

Set-Content -LiteralPath $prePushPath -Value $prePushScript -NoNewline
git config core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set core.hooksPath."
}
Write-Host "Installed $prePushPath and set core.hooksPath=.githooks"

if ($ApplyGitHubProtection) {
    Write-Step "Applying GitHub branch protection"
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        throw "GitHub CLI 'gh' is not installed or not on PATH."
    }

    gh auth status
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run 'gh auth login' first."
    }

    $repoSlug = Get-RepoSlug
    $payloadPath = Join-Path $env:TEMP "branch-protection-$($ProtectedBranch)-$(Get-Date -Format 'yyyyMMddHHmmss').json"
    $payload = @{
        required_status_checks = $null
        enforce_admins = $true
        required_pull_request_reviews = @{
            dismiss_stale_reviews = $true
            require_code_owner_reviews = $false
            required_approving_review_count = 1
            require_last_push_approval = $true
        }
        restrictions = $null
        required_linear_history = $false
        allow_force_pushes = $false
        allow_deletions = $false
        block_creations = $false
        required_conversation_resolution = $true
        lock_branch = $false
        allow_fork_syncing = $false
    } | ConvertTo-Json -Depth 10

    Set-Content -LiteralPath $payloadPath -Value $payload -NoNewline
    gh api `
        --method PUT `
        -H "Accept: application/vnd.github+json" `
        -H "X-GitHub-Api-Version: 2022-11-28" `
        "/repos/$repoSlug/branches/$ProtectedBranch/protection" `
        --input $payloadPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply GitHub branch protection."
    }

    Remove-Item -LiteralPath $payloadPath -Force
    Write-Host "Applied GitHub protection to $repoSlug branch $ProtectedBranch"
} else {
    Write-Host "Skipped GitHub branch protection. Re-run with -ApplyGitHubProtection to apply it."
}

Write-Step "Done"
Write-Host "Restart Codex for config changes to take effect."
