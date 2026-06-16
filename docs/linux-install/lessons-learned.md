# Linux Install Lessons Learned

Status: living notes

This file captures mistakes and corrections during the Linux install work so
the playbook does not regress.

## 2026-06-16: Do Not Assume The VM Exists

Problem: the first checklist was written as if the evaluation VM already
existed.

Correction:

- `install-playbook.md` starts from no VM.
- `bob-next-steps.md` starts with VM creation.
- Fresh VM verification uses `--skip-repo` because the repo is not present yet.

## 2026-06-16: First SSH Trust Must Be Explicit

Problem: the first non-interactive SSH command can hang or fail while waiting
for host-key confirmation.

Correction:

- First connection uses:

```powershell
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes kendall-linux 'whoami; hostname; cat /etc/os-release'
```

- This may add a new host key to `known_hosts`.
- Replacing an existing host key remains a stop condition.

## 2026-06-16: Operator Commands Run In PowerShell

Problem: Bash-style input redirection failed on Windows PowerShell:

```powershell
ssh kendall-linux 'bash -s -- ...' < scripts/validate-linux-install.sh
```

Correction:

- Use PowerShell-compatible streaming:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh kendall-linux 'bash -s -- --verify-only --user slaw_dawg --hostname Kendall_vNxt --skip-repo'
```

- Any host-side command examples for Bob should be written and tested as
  PowerShell unless the doc explicitly says they run inside Linux.

## 2026-06-16: Hostname And VM Display Identity Can Differ

Problem: Ubuntu normalized the OS hostname to `kendallvnxt`, while the desired
VM/display identity is `Kendall_vNxt`.

Correction:

- Treat `Kendall_vNxt` as the VM/display identity.
- Treat the Linux OS hostname as evidence and allow normalized forms.
- Do not fail the install solely because the OS hostname cannot preserve the
  underscore form.

## 2026-06-16: Fresh Ubuntu May Require Interactive Sudo

Problem: the fresh VM allowed SSH login but `sudo -n true` failed with
interactive authentication required. Non-interactive remote package install
cannot proceed through apt unless Bob enters the sudo password or approves a
different privilege model.

Correction:

- Check `sudo -n true` before remote-write package installation.
- If sudo requires a password, stop before apt mutation.
- Next safe choices are:
  - Bob runs the approved apt install command in an interactive VM terminal.
  - Bob opens an interactive SSH session and enters the sudo password there.
  - Bob stages and runs `scripts/bootstrap-linux.sh --install-toolchain` through
    an interactive SSH terminal.
  - The playbook uses a user-local toolchain path for tools that do not require
    system packages, with any limitations documented.
  - Bob explicitly approves a temporary privilege change, then removes it after
    bootstrap verification.

## 2026-06-16: GitHub Auth Is A Separate Manual Milestone

Problem: toolchain readiness does not imply private repo readiness. The VM can
have `gh` installed while clone/fetch still fails until Bob completes
interactive GitHub auth.

Correction:

- Treat `gh auth login` as a separate manual milestone.
- Verify auth without retaining raw auth output:

```bash
gh auth status >/dev/null 2>&1
```

- Verify private repo access with a non-interactive probe before cloning:

```bash
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

- Do not record token values, token scopes, auth URLs, device codes, or
  credential helper output in evidence.

## 2026-06-16: Check Target Path Before Cloning

Problem: a repeatable clone step must not overwrite an existing repo or an
unrelated directory.

Correction:

- Check `/home/slaw_dawg/Kendall_Nxt` before cloning.
- Clone only when the path is missing.
- If the path exists, inspect whether it is the expected repo and stop before
  destructive cleanup or replacement.

## 2026-06-16: Full Check Is A Separate Proof From Setup

Problem: `pnpm run setup` proves dependencies and preflight, but it does not
prove the full dashboard build and supervisor test suite.

Correction:

- After setup and verify-only pass, run:

```bash
cd /home/slaw_dawg/Kendall_Nxt && pnpm run check
```

- Record full-check evidence separately from toolchain and repo-setup evidence.
- Reboot proof remains separate even after full check passes.

## 2026-06-16: Reboot Proof May Also Require Interactive Sudo

Problem: approved reboot proof could not be started non-interactively because
`sudo -n reboot` failed with interactive authentication required.

Correction:

- Try only a non-interactive sudo reboot from automation.
- If sudo requires a password, stop before retrying.
- Bob should run the reboot from the VM console or an interactive SSH session.
- After the VM returns, Codex can run the read-only post-reboot verification.

## 2026-06-16: Fresh Clone Needed Repo-Local Hook Configuration

Problem: `node ./scripts/codex-workspace.mjs doctor` failed on the fresh VM
clone because `core.hooksPath` was not `.githooks`.

Correction:

- Run workspace doctor before the first Linux work cycle.
- If this exact failure appears, set repo-local Git config:

```bash
git config core.hooksPath .githooks
```

- Rerun doctor before creating a Codex workspace.

## 2026-06-16: Avoid Nested PowerShell-To-SSH-To-Node Quoting For Edits

Problem: a remote edit command using nested PowerShell, SSH, Bash, and
`node -e` quoting failed before mutation.

Correction:

- Do not retry the same quoting shape.
- For small remote proof files, use a PowerShell here-string piped into SSH and
  `tee`:

```powershell
@'
content
'@ | ssh kendall-linux "cd /path/to/worktree && tee docs/file.md >/dev/null"
```

- Prefer repo scripts for durable automation instead of complex inline remote
  commands.

## 2026-06-16: Agent CLIs Are Baseline Requirements

Problem: the VM passed repo setup, full check, reboot proof, and work-cycle
proof, but Codex CLI and Claude Code were not installed.

Correction:

- Treat `codex` and `claude` as required agent CLIs for the Linux development
  baseline.
- Add both to the validator.
- Install them as a separate approved agent-CLI step.
- Keep provider authentication separate and manual. Installing the CLI does not
  approve OpenAI or Anthropic login, token handling, provider calls, or paid
  usage.

## 2026-06-16: Cutover Needs An Operating Policy, Not Just Green Checks

Problem: the VM had passed technical verification, but the migration was not
complete until the operating docs named the primary baseline and defined
provider-login boundaries.

Correction:

- Update `docs/workflows/linux-primary-development-runbook.md` when Bob
  approves cutover.
- Mark the Linux target status as the active primary-development baseline.
- Record the current target identity, tool versions, completed proofs, and
  snapshot state.
- Add a provider-login policy before treating Codex CLI or Claude Code as
  operational tools.
- Keep CLI installation separate from provider login, token handling, provider
  calls, paid usage, and agent execution approvals.

## 2026-06-16: Stale Evaluation Data Must Be Replaced During Cutover

Problem: the Linux primary runbook still contained old evaluation data after
the fresh VM proof, including the old observed IP address and old tool versions.

Correction:

- During cutover, replace evaluation-state values with fresh baseline evidence.
- Keep raw IP addresses as current observations only.
- Prefer the stable `kendall-linux` SSH alias in routine commands.
- Update version rows for Node, pnpm, uv, gh, Codex CLI, and Claude Code from
  current VM checks.
