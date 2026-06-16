# Bob Next Steps: Kendall Vnxt Ubuntu Deployment

Date: 2026-06-16
Status: operator checklist

## Purpose

This is a current-instance checklist for Bob's lab VM. It is not the generic
installer entry point. New operators should start with
[install-playbook.md](install-playbook.md), which supports any fresh Ubuntu
26.04-or-later physical machine, VM, or cloud host with an existing non-root
Linux user.

This document lists the steps Bob needs to perform or approve so Kendall Vnxt
can be deployed from GitHub onto a clean Ubuntu VM and turned into a
repeatable, tested deployment playbook.

Earlier evaluation proved a Linux VM can work well for Kendall Vnxt. The
repeatable path must still start from VM creation so it does not depend on that
one evaluation machine or on operator memory.

## Current Decision

Use the full Ubuntu Linux VM as the leading primary development platform, but
keep the current Windows machine only as the operator host for SSH and private
key storage during the transition. The plan is not to maintain Windows as the
development fallback.

Target identity for the repeatable install:

| Field | Value |
| --- | --- |
| VM hostname / display name | `<vm-display-name>` |
| SSH alias | `<ssh-alias>` |
| Current observed address | Discovery value only; update `<ssh-alias>` after VM creation |
| Linux user | `<linux-user>` |
| Repo path | `$HOME/Kendall_Nxt` |
| Supported v1 OS | Ubuntu 26.04 LTS |
| Operator-host private key | `<operator-private-key-path>` |
| Target public key only | `<operator-public-key-path>` |

## Happy-Path Order

Use this order for the first repeatable Kendall Vnxt Ubuntu deployment proof:

1. Create the Ubuntu VM.
2. Create or confirm the intended Linux user.
3. Enable SSH and install only the approved public key.
4. Configure the Windows SSH alias `<ssh-alias>` to the VM's current address
   or stable local name.
5. Verify VM/display identity, OS hostname, SSH alias, and current address.
6. Verify SSH host key and login path.
7. Verify remote preconditions without mutation.
8. Run the verify-only bootstrap path.
9. Review the redacted evidence packet.
10. Approve bounded remote install only after verify-only passes.
11. Reboot only after separate reboot approval.
12. Re-run verification after reboot.
13. Complete one real Kendall Vnxt work cycle from Linux.

## Step 1: Create The Ubuntu VM

Create a new Ubuntu VM before any Kendall Vnxt bootstrap work.

Required install choices:

- Ubuntu 26.04 LTS.
- VM/display name: `<vm-display-name>`.
- Linux username: `<linux-user>`.
- OpenSSH server enabled during install when the installer offers it.
- Network mode that allows the Windows operator host to SSH into the VM.
- Sufficient disk and memory for repo install, dashboard build, supervisor
  tests, browser/e2e dependencies, and snapshots.

Do not do these during OS install:

- Do not copy a private SSH key into the VM.
- Do not authenticate GitHub.
- Do not clone Kendall Vnxt yet unless the playbook step explicitly says to.
- Do not disable password login until key-based SSH has been proven and a
  separate hardening step is approved.

After install, boot the VM and sign in as `<linux-user>` once through the VM
console. Confirm the OS is usable before setting up SSH from Windows.

## Step 2: Enable SSH And Install The Public Key

If OpenSSH server was not enabled during install, enable it manually from the VM
console. This is an operator action, not an automated bootstrap step yet.

Install only the public key from the Windows operator host:

```text
<operator-public-key-path>
```

The target file is:

```bash
$HOME/.ssh/authorized_keys
```

Required permissions:

```text
$HOME/.ssh                 700
$HOME/.ssh/authorized_keys 600
owner                      <linux-user>:<linux-user>
```

Stop if the file would be overwritten. Append the public key only if it is not
already present.

## Step 3: Confirm Stable SSH Alias

The IP address may change. Treat any raw IP address as a current observation,
not the permanent target identity.

Use `<ssh-alias>` as the durable operator target. On the current operator
host, ensure this file exists:

```text
<operator-ssh-config-path>
```

Add this entry if it is not already present:

```sshconfig
Host <ssh-alias>
  HostName <current-vm-ip-or-stable-local-name>
  User <linux-user>
  IdentityFile ~/.ssh/<ssh-key-name>
  IdentitiesOnly yes
```

First, accept the new VM host key only after confirming the address belongs to
the intended VM:

```powershell
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes <ssh-alias> 'hostname; hostnamectl --static 2>/dev/null || true; whoami'
```

This first connection records the VM host key in `known_hosts`. After the host
key is recorded, verify with the normal alias:

```powershell
ssh <ssh-alias> 'hostname; hostnamectl --static 2>/dev/null || true; whoami'
```

Expected identity:

```text
OS hostname: current Linux hostname, for example kendallvnxt
VM/display identity: <vm-display-name>
<linux-user>
```

Stop if SSH fails, `whoami` is not `<linux-user>`, the first connection would
replace an existing host key, the SSH host key changes unexpectedly, or the OS
hostname/display identity cannot be tied back to the expected `<vm-display-name>`
VM.

If the Linux OS reports a normalized hostname such as `kendallvnxt`, record
that as the OS hostname but keep `<vm-display-name>` as the VM/display identity in
this playbook. Avoid relying on the underscore form as a DNS hostname unless
the local network explicitly supports it.

If the VM address changes, update only the `HostName` field in the SSH config
or replace it with a stable DNS/Tailscale name. Do not rewrite playbook commands
to use raw IP addresses.

Preferred long-term fixes, in order:

1. DHCP reservation for the Linux VM MAC address.
2. Local DNS name, such as `<ssh-alias>.lan`.
3. Tailscale machine name, if Tailscale becomes part of the approved network
   model.

## Step 4: Confirm Public-Key-Only Rule

The private key stays on the operator host. Do not copy it to Linux targets,
Docker images, repo files, logs, screenshots, or evidence.

Only this public key may be installed on targets:

```text
<operator-public-key-path>
```

If a new Linux target needs access, append the public key only if it is absent.
Preserve existing `authorized_keys` entries. Back up the file before changing
it, and stop if ownership or permissions cannot be set exactly.

Install into:

```bash
$HOME/.ssh/authorized_keys
```

with:

```text
$HOME/.ssh                 700
$HOME/.ssh/authorized_keys 600
owner                      <linux-user>:<linux-user>
```

## Step 5: Approve Contract-First Work

Approve Codex to create these repo files:

```text
docs/linux-install/install-contract.md
docs/linux-install/validation-matrix.md
docs/linux-install/ssh-key-policy.md
docs/linux-install/evidence/schema.md
docs/linux-install/remote-approval-template.md
scripts/validate-linux-install.sh
scripts/linux-bootstrap.mjs
```

This first milestone is verify-only. It must not install packages, mutate the
remote VM, reboot anything, copy secrets, or authenticate GitHub.

The long-term operator target is one command with internal gates. This is a
future target command surface, not a command that exists in the current
milestone:

```powershell
pnpm run linux:bootstrap -- --target <ssh-alias> --user <linux-user> --apply
```

Current milestone note: `linux:bootstrap --apply` is not implemented yet. Use
the generic on-host playbook path until a future apply mode is explicitly
implemented and approved.

That command must still run as:

```text
plan -> verify -> apply -> verify -> evidence
```

and fail closed on unsupported OS, missing user, dirty repo, private-key input,
or unapproved remote mutation. Missing provider or repository-service auth is a
post-deployment user step, not a bootstrap failure.

## Step 6: Review The Contract

Before any install/apply automation exists, review
`docs/linux-install/install-contract.md`.

Confirm it says:

- Ubuntu 26.04 only for v1.
- Existing intended Linux user only.
- No user creation in v1.
- No private key transfer.
- No scripted GitHub token handling.
- Remote mutation requires explicit Bob approval.
- Evidence must be redacted.
- Container evidence is not VM-certified evidence.

Do not approve bootstrap apply mode until this contract is clear.

## Step 7: Run Verify-Only On The Linux VM

After `scripts/validate-linux-install.sh` exists locally, run the validator by
streaming it over SSH. This avoids assuming the repo has already been cloned to
the fresh VM:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh <ssh-alias> 'bash -s -- --verify-only --skip-repo'
```

On a brand-new VM, missing Node, pnpm, uv, gh, and repo checks are expected
findings. Missing provider or repository-service auth should be reported as a
post-deployment state only. The purpose of this first verify-only pass is to
prove the target identity and produce a precise missing-tool list before any
apply mode is approved.

Expected:

- Ubuntu 26.04 detected.
- current remote user detected.
- hostname/display identity is recorded.
- missing tools and repo are reported without mutation.
- no broad environment or credential data is printed.

Stop if the validator tries to mutate anything.

After a future approved apply mode installs tools and clones the repo, rerun
verify-only without `--skip-preflight`:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh <ssh-alias> 'bash -s -- --verify-only'
```

## Step 8: Confirm Evidence Packet

The validator should write a redacted evidence packet.

Allowed evidence:

- timestamp
- target alias
- OS release
- user
- repo path and commit
- command names
- tool versions
- pass/fail result
- sanitized error summary

Forbidden evidence:

- private keys
- tokens
- full environment dumps
- shell history
- raw auth payloads
- credential helper contents
- arbitrary home-directory listings
- provider payloads or secrets

Stop if evidence contains sensitive data.

## Step 9: Decide Container Engine

Pick one v1 container engine:

- Docker, if it is already the simplest available engine.
- Podman, if Linux-native daemonless validation is preferred.

Do not support both in v1 unless there is a clear reason.

Record the decision in:

```text
docs/linux-install/implementation-plan.md
```

## Step 10: Approve Container Apply Only

After verify-only passes, approve bootstrap apply mode only for disposable
containers first.

The first container target is:

```text
ubuntu:26.04
```

Success means:

- clean container install passes
- second run is idempotent
- unsupported OS fails safely
- private key material is not written
- results are labeled `container-only`

Container success does not prove the VM is ready.

## Step 11: Approve Remote VM Apply Separately

Remote mutation requires a named approval packet.

Do not approve remote apply unless the packet names:

- target host
- target alias or stable name, preferably `<ssh-alias>`
- target user
- operation family
- exact command or script
- expected files changed
- packages installed or removed
- config files touched
- services enabled, disabled, started, or stopped
- credential or auth state changes
- reboot or session requirements
- rollback or recovery path
- rollback limits
- evidence destination

GitHub, provider, and Tailscale auth remain manual post-deployment user steps.
Bootstrap may install CLIs and detect auth state, but must not run
`gh auth login`, provider login commands, Tailscale auth, browser/device-code
flows, consume tokens, read token files, copy credential state, or write
credential helper configuration.

Example remote approval packet:

```text
Approval: Kendall Vnxt Ubuntu deployment remote-write
Target alias: <ssh-alias>
Current observed address: discovery value from SSH config or VM manager
Target user: <linux-user>
VM/display identity: <vm-display-name>
Operation family: remote-write
Command/script: node ./scripts/linux-bootstrap.mjs --target <ssh-alias> --user <linux-user> --apply
Current milestone note: this apply command is a future approval-template
example, not a currently implemented command.
Expected file changes: repo clone/config only as listed by --plan; no private key writes
Packages/config/services: only those listed by --plan; no service enable/start unless separately approved
Credential/auth changes: install gh allowed; GitHub/provider/Tailscale login and token handling are not part of base bootstrap
Reboot/session requirements: reboot not approved in this packet
Rollback/recovery path: stop on failure; preserve evidence; restore from Git, VM snapshot, or fresh Kendall Vnxt Ubuntu deployment path
Rollback limits: package installs may require manual package removal; no destructive cleanup approved
Evidence destination: redacted packet under approved Kendall Vnxt Ubuntu deployment evidence path
```

## Step 12: Run Reboot Proof

Reboot is a gated authority. Before running it, approve a reboot packet naming:

- target alias or stable name
- expected downtime
- reconnect command
- rollback or recovery path if SSH does not return
- evidence destination

After reboot approval, run:

```bash
sudo reboot
```

If `sudo -n reboot` fails from automation because sudo requires a password, Bob
runs `sudo reboot` from the VM console or an interactive SSH session. Do not
send the sudo password through chat or scripts.

Then from Windows:

```powershell
ssh <ssh-alias> 'cd "$HOME/Kendall_Nxt" && node --version && pnpm --version && uv --version && gh --version && pnpm run preflight'
```

Expected:

- SSH reconnects.
- Node resolves.
- pnpm resolves.
- uv resolves without PATH override.
- gh resolves. GitHub auth is checked only later when a selected workflow needs
  private repo access.
- preflight passes.

Record this as reboot proof evidence.

Current pre-reboot evidence already captured:

- Fresh VM toolchain verification.
- Optional post-deployment GitHub auth and private repo access, when repo work
  required it.
- Repo clone, setup, and verify-only.
- Full `pnpm run check` with dashboard build and supervisor tests.

## Step 13: Complete First Real Linux Work Cycle

Use Linux for one small real Kendall Vnxt task.

Minimum cycle:

```bash
cd "$HOME/Kendall_Nxt"
git status --short --branch
pnpm run preflight
pnpm run check
node ./scripts/codex-workspace.mjs doctor
```

Then complete a small docs or script change from Linux, verify it, and record:

- what changed
- commands run
- result
- whether cleanup was needed

Only after this passes should the Kendall Vnxt Ubuntu deployment path be treated as the active
development baseline.

## Step 14: Optional Post-Install Tasks

These are not base bootstrap requirements. Do them only when a selected
workflow needs them.

GitHub/private repo access:

- Bob runs `gh auth login` interactively inside the VM.
- Codex may run redacted status/private-repo probes after login.
- Missing GitHub auth is not a base bootstrap failure.

Provider CLIs:

- Bob logs in to Codex or Claude interactively only when that workflow needs
  provider access.
- Provider calls, paid usage, token handling, and agent execution still require
  separate approval.
- Do not store API keys, device codes, auth URLs, or token output in docs,
  scripts, chat, or evidence.

Tailscale/MagicDNS:

- Bob performs Tailnet enrollment after install only if stable Tailscale access
  is desired.
- `tailscale ip -4` returning `NeedsLogin` is not a base bootstrap failure.
- Treat Tailscale/MagicDNS as proven only after the `<ssh-alias>` SSH alias
  is tested through the approved stable name.

## Step 15: Snapshot And Fallback

Before relying on Linux as the active development baseline:

- take a VMware snapshot of the Linux VM
- confirm repo work is pushed or otherwise preserved
- record how to recover if SSH, post-deployment repo auth, disk, or networking
  fails

Fallback trigger examples:

- SSH outage
- unknown host-key change
- post-deployment repo auth failure that cannot be recovered safely
- repeated platform-caused `pnpm run check` failure
- ambiguous worktree state
- VM disk or snapshot issue

## Current Next Action

Kendall Vnxt Ubuntu deployment proof complete:

```text
Target alias: <ssh-alias>
Target user: <linux-user>
Toolchain: verified
GitHub auth: manually completed post-deployment for repo access
Repo clone/setup/preflight: verified
Full pnpm run check: verified
Dashboard Playwright e2e: verified
Reboot proof: verified
First real work cycle: verified
VM snapshot: taken
Codex CLI and Claude Code: verified
BMAD Method CLI: verified
Provider login policy: documented
Decision: <ssh-alias> is primary Kendall Vnxt development baseline
```
