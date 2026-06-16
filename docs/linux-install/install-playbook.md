# Linux Install Playbook

Status: draft v1

This playbook starts from no Linux VM. It intentionally does not assume the
earlier evaluation VM still exists.

## 1. Create The VM

Create a new Ubuntu VM with:

- Ubuntu 26.04 LTS.
- VM/display name `Kendall_vNxt`.
- Linux user `slaw_dawg`.
- OpenSSH server enabled when offered by the installer.
- SSH public key import from GitHub is allowed if GitHub contains the matching
  public key for the Windows private key.
- Network mode that allows SSH from the Windows operator host.
- Enough disk and memory for repo install, builds, tests, and snapshots.

Do not copy private keys, authenticate GitHub, or clone the repo during OS
install.

If the Ubuntu installer offers "Import SSH keys from GitHub", that imports
public keys into `/home/slaw_dawg/.ssh/authorized_keys` for logging into the VM.
It does not copy your private key, and it does not authenticate the VM to
GitHub for cloning the repo.

Before using that installer option, confirm the public key exists in your
GitHub account. On the Windows operator host, the public key file is:

```text
C:\Users\slaw_dawg\.ssh\kendall_linux_vm_eval_ed25519.pub
```

To view it locally:

```powershell
Get-Content $env:USERPROFILE\.ssh\kendall_linux_vm_eval_ed25519.pub
```

If that public key is not in GitHub yet, add it to your GitHub account under
SSH keys. Use a clear title such as:

```text
Kendall_vNxt VM login from Windows host
```

Command-line option, if `gh` is authenticated on Windows:

```powershell
gh ssh-key add $env:USERPROFILE\.ssh\kendall_linux_vm_eval_ed25519.pub --title "Kendall_vNxt VM login from Windows host"
```

During Ubuntu install, enter your GitHub username only after confirming the key
is present in GitHub. If the import fails or the key is missing, continue the
install and use Step 4 to install the public key manually.

## 2. Boot And Confirm Console Access

Sign in through the VM console as `slaw_dawg`.

Confirm:

```bash
whoami
hostname
cat /etc/os-release
```

Expected:

- `whoami` is `slaw_dawg`.
- Ubuntu version is 26.04.
- The VM/display identity is recorded as `Kendall_vNxt`.

If the OS hostname cannot contain the underscore, record the normalized OS
hostname separately. Keep `Kendall_vNxt` as the VM/display identity.

## 3. Enable SSH

Enable OpenSSH server if it was not enabled during install. This is a manual
operator step in v1.

Confirm from the VM:

```bash
systemctl status ssh --no-pager
```

If `systemctl` reports SSH is missing or inactive, fix that from the VM console
before continuing. Do not proceed with remote bootstrap until SSH works.

## 4. Install Or Confirm Public Key Only

If the Ubuntu installer imported your GitHub SSH keys, confirm key login works
before changing anything. If it did not import keys, install only the public key
from:

```text
C:\Users\slaw_dawg\.ssh\kendall_linux_vm_eval_ed25519.pub
```

Target:

```bash
/home/slaw_dawg/.ssh/authorized_keys
```

Rules:

- Append only if absent.
- Preserve existing keys.
- Do not copy the private key.
- Set `.ssh` to `700`.
- Set `authorized_keys` to `600`.
- Keep ownership as `slaw_dawg:slaw_dawg`.

## 5. Configure Windows SSH Alias

Find the VM's current IP address or stable local DNS name from the VM manager,
router, or VM console.

Add or update this Windows SSH config entry:

```sshconfig
Host kendall-linux
  HostName <current-vm-ip-or-stable-local-name>
  User slaw_dawg
  IdentityFile ~/.ssh/kendall_linux_vm_eval_ed25519
  IdentitiesOnly yes
```

Do not use the raw IP address in routine playbook commands. Keep the raw IP
inside the `HostName` field only until a stable local name is available.

## 6. Accept Host Key And Verify SSH Identity

The first SSH connection to a newly created VM must trust the VM host key.
Accept it only after confirming the IP or local name belongs to the new
`Kendall_vNxt` VM in the VM console, VM manager, or router.

From Windows PowerShell, run the first connection with `accept-new`:

```powershell
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes kendall-linux 'whoami; hostname; cat /etc/os-release'
```

This records the VM host key in `known_hosts` if it is not already present.
After that first trust step, use the normal alias:

```powershell
ssh kendall-linux 'whoami; hostname; cat /etc/os-release'
```

Stop if:

- The host key is unexpected.
- The first connection would replace an existing host key.
- Login prompts for the wrong user.
- `whoami` is not `slaw_dawg`.
- Ubuntu is not 26.04.
- The target cannot be tied back to `Kendall_vNxt`.

## 7. Run Verify-Only

After the repo contains the validator, run the no-mutation validator through
SSH:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt --skip-repo'
```

Review the redacted output. Missing provider or repository-service auth is not
a base bootstrap failure. Treat it as a post-deployment user step only if a
selected workflow needs that service.

After future approved setup installs the toolchain and clones the repo, rerun
without `--skip-repo`:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt'
```

## 8. Continue To Apply Gates

Do not run remote apply until:

- Verify-only passes or has only accepted warnings.
- `sudo -n true` either passes or the install uses an explicitly approved
  interactive/user-local privilege path.
- The approval packet in `remote-approval-template.md` is complete.
- Rollback limits are understood.
- Evidence destination is approved.
- Reboot, if needed, is approved separately.

## 9. Interactive Toolchain Install

When sudo requires a password, stage the bootstrap script to the VM and run it
from an interactive SSH terminal:

```powershell
scp scripts\bootstrap-linux.sh kendall-linux:~/bootstrap-kendall-toolchain.sh
ssh -t kendall-linux 'bash ~/bootstrap-kendall-toolchain.sh --dry-run'
ssh -t kendall-linux 'bash ~/bootstrap-kendall-toolchain.sh --install-toolchain'
```

The script may prompt for the VM password through sudo. Do not send the sudo
password through chat, logs, scripts, or evidence.

The script installs only the toolchain:

- Ubuntu packages: `nodejs`, `npm`, `gh`, `build-essential`, `python3-venv`,
  `curl`, `ca-certificates`, `git`.
- `pnpm@11.5.2`.
- `uv` for the current Linux user, with system-visible `uv`/`uvx` symlinks if
  needed.

It does not clone the repo, authenticate GitHub, copy private keys, start
long-running services, or reboot.

## 10. Agent CLI And BMAD Method Install

Codex CLI, Claude Code, and BMAD Method are required for the full development
baseline. They are separate from GitHub auth and repo setup.

Install them from an interactive SSH terminal after the base toolchain is ready:

```powershell
ssh -t kendall-linux 'bash ~/bootstrap-kendall-toolchain.sh --install-agent-clis'
```

This installs:

- Codex CLI package: `@openai/codex`
- Claude Code package: `@anthropic-ai/claude-code`
- BMAD Method package: `bmad-method`

It does not authenticate OpenAI, authenticate Anthropic, run `bmad-method
install`, clone the repo, start services, or reboot. Provider login/setup and
BMAD project install/upgrade remain separate manual milestones.

## 11. Optional Post-Deployment Repo Access

Base Linux VM bootstrap is complete without GitHub authentication. If the next
workflow needs access to a private GitHub repo, Bob performs GitHub auth
manually from the VM after deployment:

```bash
gh auth login
```

Do not paste tokens into scripts, chat, logs, or evidence.

Verify auth and private repo access without retaining raw credential output:

```bash
gh auth status >/dev/null 2>&1 && echo gh-auth-ok
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

Before cloning, check the target path:

```bash
if [ -e /home/slaw_dawg/Kendall_Nxt ]; then
  echo "target path exists; inspect before cloning"
else
  git clone https://github.com/slawdawg/Kendall-vnxt.git /home/slaw_dawg/Kendall_Nxt
fi
```

Then run setup:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run setup
```

Run verify-only without `--skip-repo` from the Windows operator host:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt'
```

## 12. Full Check Before Reboot

After setup and verify-only pass, run:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run check
```

This proves the documentation checks, dashboard production build, and
supervisor tests before reboot proof.

## 13. Playwright Browser And E2E Proof

The full check does not prove browser runtime readiness. On Ubuntu 26.04,
Playwright 1.60.0 cannot install Chromium, so the repo baseline uses
`@playwright/test` 1.61.0 or newer.

Install browser dependencies from an interactive Linux terminal if sudo is
required:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm dlx playwright@1.61.0 install-deps chromium
```

Install or refresh browser binaries:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm exec playwright install chromium
```

Run the dashboard e2e proof:

```bash
cd /home/slaw_dawg/Kendall_Nxt
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

Expected: all dashboard e2e tests pass. Record the result as separate evidence
from `pnpm run check`.

## 14. Reboot Proof

After full check and Playwright e2e pass, reboot the VM through the console or
an approved interactive SSH session:

```bash
sudo reboot
```

After SSH returns, rerun verify-only, preflight, and a small toolchain probe:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run preflight
node ./scripts/codex-workspace.mjs doctor
codex --version
claude --version
bmad-method --version
```

## 15. Real Work-Cycle Proof

Create, verify, and clean up an isolated Codex workspace experiment from the
Linux clone. Use the runbook command in
`docs/workflows/linux-primary-development-runbook.md` and record the result.

## 16. Snapshot

After the toolchain, GitHub auth, repo setup, full check, Playwright e2e,
reboot proof, and real work-cycle proof pass, take a VM snapshot.

Record:

- Snapshot date.
- Repo branch and commit.
- Tool versions.
- Any remaining policy-only gaps.
