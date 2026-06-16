# Kendall Vnxt Ubuntu Deployment Playbook

Status: draft v1

This playbook deploys Kendall Vnxt from GitHub onto a fresh Ubuntu host. The
host can be a physical machine, VM, or cloud instance. It intentionally does
not assume the earlier evaluation VM still exists.

## 1. Prepare The Ubuntu Host

Prepare or choose an Ubuntu host with:

- Ubuntu 26.04 LTS or later.
- A non-root Linux user.
- OpenSSH server enabled when offered by the installer.
- SSH public key import from GitHub is allowed if GitHub contains the matching
  public key for the operator's private key.
- Network access that allows SSH from the operator host.
- Enough disk and memory for repo install, builds, tests, and snapshots.

Do not copy private keys, authenticate GitHub, or clone the repo during OS
install.

If the Ubuntu installer offers "Import SSH keys from GitHub", that imports
public keys into the Linux user's `~/.ssh/authorized_keys` for logging into the
host.
It does not copy your private key, and it does not authenticate the host to
GitHub for cloning the repo.

Before using that installer option, confirm the public key exists in your
GitHub account. On the operator host, use the public key that matches the
private key you will use for SSH. Example Windows operator-host path:

```text
C:\Users\<operator>\.ssh\<ssh-key-name>.pub
```

To view it locally:

```powershell
Get-Content "$env:USERPROFILE\.ssh\<ssh-key-name>.pub"
```

If that public key is not in GitHub yet, add it to your GitHub account under
SSH keys. Use a clear title such as:

```text
Kendall Vnxt Ubuntu host login
```

Command-line option, if `gh` is authenticated on Windows:

```powershell
gh ssh-key add "$env:USERPROFILE\.ssh\<ssh-key-name>.pub" --title "Kendall Vnxt Ubuntu host login"
```

During Ubuntu install, enter your GitHub username only after confirming the key
is present in GitHub. If the import fails or the key is missing, continue the
install and use Step 4 to install the public key manually.

## 2. Boot And Confirm Console Or SSH Access

Sign in as the intended non-root Linux user.

Confirm:

```bash
whoami
hostname
cat /etc/os-release
```

Expected:

- `whoami` is the intended deployment user.
- Ubuntu version is 26.04 or later.
- The host identity, OS hostname, and SSH target name are recorded.

If the OS hostname cannot contain the underscore, record the normalized OS
hostname separately. Do not assume a display name and OS hostname are the same.

## 3. Enable SSH

Enable OpenSSH server if it was not enabled during install. This is a manual
operator step in v1.

Confirm from the Ubuntu host:

```bash
systemctl status ssh --no-pager
```

If `systemctl` reports SSH is missing or inactive, fix that from the host console
before continuing. Do not proceed with remote bootstrap until SSH works.

## 4. Install Or Confirm Public Key Only

If the Ubuntu installer imported your GitHub SSH keys, confirm key login works
before changing anything. If it did not import keys, install only the public key
from:

```text
C:\Users\<operator>\.ssh\<ssh-key-name>.pub
```

Target:

```bash
~/.ssh/authorized_keys
```

Rules:

- Append only if absent.
- Preserve existing keys.
- Do not copy the private key.
- Set `.ssh` to `700`.
- Set `authorized_keys` to `600`.
- Keep ownership as the target Linux user.

## 5. Primary Path: Clone From GitHub On The Ubuntu Host

Use this path when the person installing Kendall Vnxt is working directly on
the fresh Ubuntu host. This is the generic deployment path.

Install only the seed tools needed to reach GitHub:

```bash
sudo apt-get update
sudo apt-get install -y git gh ca-certificates curl
```

If the Kendall Vnxt repository is private, authenticate GitHub manually from
the Ubuntu host:

```bash
gh auth login
```

Do not paste tokens into scripts, chat, logs, or evidence. If the repository is
public, no GitHub login is required.

Clone the repository into the default path.

For a public repository or any environment where HTTPS Git credentials are
already configured:

```bash
repo_url="https://github.com/slawdawg/Kendall-vnxt.git"
repo_path="$HOME/Kendall_Nxt"

if [ -e "$repo_path" ]; then
  echo "target path exists; inspect before cloning"
else
  git clone "$repo_url" "$repo_path"
fi
```

For a private repository after `gh auth login`, prefer `gh repo clone` so the
GitHub CLI uses the authenticated account explicitly:

```bash
repo_path="$HOME/Kendall_Nxt"

if [ -e "$repo_path" ]; then
  echo "target path exists; inspect before cloning"
else
  gh repo clone slawdawg/Kendall-vnxt "$repo_path"
fi
```

Enter the checkout and run the bootstrap scripts locally:

```bash
cd "$HOME/Kendall_Nxt"
bash scripts/bootstrap-linux.sh --dry-run
bash scripts/bootstrap-linux.sh --install-toolchain
bash scripts/bootstrap-linux.sh --install-agent-clis
bash scripts/bootstrap-linux.sh --verify-only
pnpm run setup
bash scripts/validate-linux-install.sh --verify-only
```

This path does not require a Windows operator host, SSH alias, or script
streaming over SSH. It still keeps provider login, Tailscale enrollment,
BMAD project install/upgrade, long-running services, reboot, and paid/provider
calls out of the base bootstrap.

## 6. Optional Remote Operator Path: Configure SSH Alias

Find the host's current IP address, DNS name, or stable SSH name.

From an operator host, add or update an SSH config entry:

```sshconfig
Host <ssh-alias>
  HostName <current-host-ip-or-stable-name>
  User <linux-user>
  IdentityFile ~/.ssh/<ssh-key-name>
  IdentitiesOnly yes
```

Do not use a raw IP address in routine playbook commands. Keep any raw IP inside
the SSH config `HostName` field only until a stable local name is available.

## 7. Optional Remote Operator Path: Accept Host Key

The first SSH connection to a newly prepared host must trust the host key.
Accept it only after confirming the IP or local name belongs to the new
Ubuntu host in the console, host manager, cloud console, or router.

From the operator host, run the first connection with `accept-new`:

```powershell
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes <ssh-alias> 'whoami; hostname; cat /etc/os-release'
```

This records the host key in `known_hosts` if it is not already present.
After that first trust step, use the normal alias:

```powershell
ssh <ssh-alias> 'whoami; hostname; cat /etc/os-release'
```

Stop if:

- The host key is unexpected.
- The first connection would replace an existing host key.
- Login prompts for the wrong user.
- `whoami` is not the intended Linux user.
- Ubuntu is older than 26.04.
- The target cannot be tied back to the intended host.

## 8. Optional Remote Operator Path: Stage And Run Bootstrap

Use this path when the bootstrap is being driven from another machine over SSH
instead of directly from the Ubuntu host.

Stage the bootstrap script to the host and run it from an interactive SSH
terminal:

```powershell
scp scripts\bootstrap-linux.sh <ssh-alias>:~/bootstrap-kendall-toolchain.sh
ssh -t <ssh-alias> 'bash ~/bootstrap-kendall-toolchain.sh --dry-run'
ssh -t <ssh-alias> 'bash ~/bootstrap-kendall-toolchain.sh --install-toolchain'
ssh -t <ssh-alias> 'bash ~/bootstrap-kendall-toolchain.sh --install-agent-clis'
ssh -t <ssh-alias> 'bash ~/bootstrap-kendall-toolchain.sh --verify-only'
```

The script may prompt for the Linux user's password through sudo. Do not send
the sudo password through chat, logs, scripts, or evidence.

After the repo has been cloned and `pnpm run setup` has completed, run
verify-only without `--skip-repo`:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh <ssh-alias> 'bash -s -- --verify-only'
```

Review the redacted output. Missing provider or repository-service auth is not
a base bootstrap failure. Treat it as a post-deployment user step only if a
selected workflow needs that service.

## 9. Continue To Apply Gates

Do not run remote apply until:

- Verify-only passes or has only accepted warnings.
- `sudo -n true` either passes or the install uses an explicitly approved
  interactive/user-local privilege path.
- The approval packet in `remote-approval-template.md` is complete.
- Rollback limits are understood.
- Evidence destination is approved.
- Reboot, if needed, is approved separately.

## 10. Toolchain Install Scope

The script installs only the toolchain:

- Ubuntu packages: `nodejs`, `npm`, `gh`, `build-essential`, `python3-venv`,
  `curl`, `ca-certificates`, `git`.
- Node must satisfy the repo engine range: `>=22 <25`.
- `pnpm@11.5.2`.
- `uv` for the current Linux user, with system-visible `uv`/`uvx` symlinks if
  needed.

It does not clone the repo, authenticate GitHub, copy private keys, start
long-running services, or reboot.

## 11. Agent CLI And BMAD Method Install

Codex CLI, Claude Code, and BMAD Method are required for the full development
baseline. They are separate from GitHub auth and repo setup.

Install them after the base toolchain is ready:

```bash
bash scripts/bootstrap-linux.sh --install-agent-clis
```

This installs:

- Codex CLI package: `@openai/codex`
- Claude Code package: `@anthropic-ai/claude-code`
- BMAD Method package: `bmad-method`

Current v1 installs these agent CLIs from the npm registry without a dedicated
lockfile for global tool versions. Record the resolved versions after install.
Treat pinned global CLI versions and installer-integrity evidence as a separate
maintenance hardening task before claiming supply-chain certification.

It does not authenticate OpenAI, authenticate Anthropic, run `bmad-method
install`, clone the repo, start services, or reboot. Provider login/setup and
BMAD project install/upgrade remain separate manual milestones.

## 12. Base Bootstrap Completion Checklist

Base Linux bootstrap is complete when:

- Direct console access works, or SSH access works through the chosen stable
  SSH alias or host name when using the remote operator path.
- The target identity is verified as the intended Linux user on Ubuntu 26.04 or
  later.
- Host-key trust has been accepted for the correct host when using SSH.
- The base toolchain is installed and version checks pass.
- Codex CLI, Claude Code, and BMAD Method CLI are installed and version checks
  pass.
- `scripts/validate-linux-install.sh --verify-only --skip-repo` passes,
  allowing only accepted warnings.
- `scripts/bootstrap-linux.sh --verify-only` passes.

Base bootstrap does not require:

- GitHub login.
- OpenAI/Codex login.
- Anthropic/Claude login.
- Tailscale login or Tailnet enrollment.
- Private repo clone when only proving the base toolchain.
- Provider calls, paid usage, or agent execution.
- Long-running development services.

Kendall Vnxt deployment, as opposed to base toolchain bootstrap, also requires
the repo checkout and `pnpm run setup` to complete. A public repo can be cloned
without GitHub login. A private repo requires user-performed GitHub auth before
clone.

Full Kendall Vnxt deployment is complete when:

- The repo checkout exists at `$HOME/Kendall_Nxt` or the operator-provided
  `--repo` path.
- `pnpm run setup` has completed.
- `scripts/validate-linux-install.sh --verify-only` passes without
  `--skip-repo`.

## 13. Repo Checkout Or Private Repo Auth

Skip this section if you already cloned the repo and ran `pnpm run setup` in
the primary on-host path.

Base toolchain bootstrap is complete without GitHub authentication. Kendall
Vnxt deployment from a private GitHub repo requires the user to perform GitHub
auth manually from the Ubuntu host before clone:

```bash
gh auth login
```

Do not paste tokens into scripts, chat, logs, or evidence.

Verify auth and private repo access without retaining raw credential output:

```bash
gh auth status >/dev/null 2>&1 && echo gh-auth-ok
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

Before cloning, check the target path. Default path:

```bash
repo_path="$HOME/Kendall_Nxt"
```

```bash
if [ -e "$repo_path" ]; then
  echo "target path exists; inspect before cloning"
elif gh auth status >/dev/null 2>&1; then
  gh repo clone slawdawg/Kendall-vnxt "$repo_path"
else
  git clone https://github.com/slawdawg/Kendall-vnxt.git "$repo_path"
fi
```

Then run setup:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run setup
```

Run verify-only without `--skip-repo`:

```bash
bash scripts/validate-linux-install.sh --verify-only
```

## 14. Optional Post-Deployment Provider Login

Base Linux bootstrap is complete without OpenAI/Codex or Anthropic/Claude
login. If a later workflow needs those tools, the user performs login
interactively inside the Ubuntu host.

Rules:

- Do not automate provider login.
- Do not paste API keys, device codes, auth URLs, or tokens into scripts, chat,
  logs, or evidence.
- Record only that the provider action was manually completed and that no token
  details were retained.
- Provider calls, paid usage, and agent execution require separate approval.

## 15. Optional Post-Deployment Tailscale Enrollment

Base Linux bootstrap is complete without Tailscale login. If a later workflow
needs Tailnet access or MagicDNS, the user performs Tailscale enrollment after
deployment.

Read-only package checks may report:

```bash
command -v tailscale
systemctl is-active tailscaled
tailscale ip -4
```

`NeedsLogin` is not a bootstrap failure. Tailscale/MagicDNS is proven only
after the user completes enrollment and the SSH alias is tested through the
approved stable name.

## 16. Full Check Before Reboot

After setup and verify-only pass, run:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run check
```

This proves the documentation checks, dashboard production build, and
supervisor tests before reboot proof.

## 17. Playwright Browser And E2E Proof

The full check does not prove browser runtime readiness. On Ubuntu 26.04,
Playwright 1.60.0 cannot install Chromium, so the repo baseline uses
`@playwright/test` 1.61.0 or newer.

Install browser dependencies from an interactive Linux terminal if sudo is
required:

```bash
cd "$HOME/Kendall_Nxt"
pnpm dlx playwright@1.61.0 install-deps chromium
```

Install or refresh browser binaries:

```bash
cd "$HOME/Kendall_Nxt"
pnpm exec playwright install chromium
```

Run the dashboard e2e proof:

```bash
cd "$HOME/Kendall_Nxt"
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

Expected: all dashboard e2e tests pass. Record the result as separate evidence
from `pnpm run check`.

## 18. Reboot Proof

After full check and Playwright e2e pass, reboot the host through the console or
an approved interactive SSH session:

```bash
sudo reboot
```

After SSH returns, rerun verify-only, preflight, and a small toolchain probe:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run preflight
node ./scripts/codex-workspace.mjs doctor
codex --version
claude --version
bmad-method --version
```

## 19. Real Work-Cycle Proof

Create, verify, and clean up an isolated Codex workspace experiment from the
Linux clone. Use the runbook command in
`docs/workflows/linux-primary-development-runbook.md` and record the result.

## 20. Snapshot

After the toolchain, any needed post-deployment repo access, repo setup, full
check, Playwright e2e, reboot proof, and real work-cycle proof pass, take a
snapshot or backup appropriate for the host type.

Record:

- Snapshot date.
- Repo branch and commit.
- Tool versions.
- Any remaining policy-only gaps.
