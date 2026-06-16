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

- Treat `gh auth login` as a separate post-deployment user milestone, not part
  of base VM bootstrap.
- Do not fail base bootstrap because GitHub auth is absent.
- Run GitHub auth only when a selected workflow needs private repo access.
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

## 2026-06-16: Agent CLIs And BMAD Method Are Baseline Requirements

Problem: the VM passed repo setup, full check, reboot proof, and work-cycle
proof, but Codex CLI, Claude Code, and then BMAD Method were not all installed.

Correction:

- Treat `codex`, `claude`, and `bmad-method` as required CLIs for the Linux
  development baseline.
- Add all three to the validator.
- Install them as a separate approved agent-CLI step.
- Keep provider authentication separate and manual. Installing the CLI does not
  approve OpenAI or Anthropic login, token handling, provider calls, or paid
  usage.
- Keep BMAD project install/upgrade separate. Installing the `bmad-method`
  package does not approve rewriting `_bmad`, `.claude`, or other project
  integration files.

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
  authenticated operational tools.
- Keep CLI installation and base bootstrap separate from provider login, token
  handling, provider calls, paid usage, and agent execution approvals.
- Provider/repository-service login is a post-deployment user action only when
  a workflow needs it.

## 2026-06-16: Stale Evaluation Data Must Be Replaced During Cutover

Problem: the Linux primary runbook still contained old evaluation data after
the fresh VM proof, including the old observed IP address and old tool versions.

Correction:

- During cutover, replace evaluation-state values with fresh baseline evidence.
- Keep raw IP addresses as current observations only.
- Prefer the stable `kendall-linux` SSH alias in routine commands.
- Update version rows for Node, pnpm, uv, gh, Codex CLI, and Claude Code from
  current VM checks.

## 2026-06-16: Playwright Package Does Not Prove Browser Runtime

Problem: `pnpm exec playwright --version` passed, but
`~/.cache/ms-playwright` was missing on the VM.

Correction:

- Treat Playwright package availability and browser runtime availability as
  separate checks.
- Dashboard build and supervisor tests are proven by `pnpm run check`.
- Playwright 1.60.0 is not enough for Ubuntu 26.04 browser install.
- Playwright 1.61.0 downloaded Chromium successfully, but browser launch still
  required missing system libraries such as `libatk-1.0.so.0`.
- Dashboard e2e tests need a separate approved browser install/dependency/proof
  step:

```bash
pnpm dlx playwright@1.61.0 install-deps chromium
pnpm run test:e2e:dashboard
```

- This is remote-write because it downloads browser binaries and may install
  system packages.
- If sudo is required, Bob must run the dependency command interactively.

## 2026-06-16: Playwright Runtime And Test Correctness Are Separate

Problem: after Playwright 1.61 browser download and system dependencies were
installed, the suite launched but still failed three dashboard assertions.

Correction:

- Treat browser/runtime readiness separately from e2e test correctness.
- Intermediate `22 passed, 3 failed` meant Linux could run Playwright, but the
  dashboard e2e suite still needed test/app triage.
- Do not label the e2e lane complete until the full dashboard e2e command
  passes on the VM.
- The final proof passed:

```bash
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

Result: `25 passed`.

## 2026-06-16: E2E Tests Must Not Depend On Shared Fixture Counts

Problem: after Linux Playwright runtime was fixed, several failures were
caused by brittle assumptions in dashboard e2e assertions:

- Empty-state text was expected even when previous tests had already created
  proposed work.
- A navigation badge was expected to contain a specific count even though the
  suite can create multiple active items.
- Subscription launch readiness expected stale/rejected approval values that
  belong to later dedicated tests.
- A plain `false` text lookup matched multiple safety flags under strict mode.

Correction:

- Scope empty-state assertions to cases where no item cards exist.
- Assert route availability and page behavior instead of exact shared-state
  counts.
- Keep stale/rejected launch assertions in the stale/rejected tests.
- Use exact or first-match locators when repeated status values are expected.

## 2026-06-16: Avoid Remote Grep Regex Pipes From PowerShell

Problem: a focused Playwright rerun command used a `--grep` pattern with `|`
through PowerShell-to-SSH quoting. The remote shell treated pieces of the regex
as commands and caused an `EPIPE` in the test runner.

Correction:

- Do not send regex pipes through ad hoc host-to-SSH command strings.
- Use simple exact commands, a checked-in script, or run the command inside an
  interactive Linux shell.
- After a failed remote test command, check for leftover exact process names:

```bash
pgrep -x node || true
pgrep -x uv || true
pgrep -x python || true
pgrep -x python3 || true
```

## 2026-06-16: Verify-Only Must Fail Closed

Problem: review found that the Linux validator and bootstrap verify-only paths
could report success too easily:

- A tool shim could exist while its `--version` command failed.
- A missing value for `--user`, `--repo`, or `--evidence` could hang argument
  parsing instead of returning usage.
- `bootstrap-linux.sh --verify-only` printed missing tools but did not make
  them affect the exit code.

Correction:

- Version checks now fail if the command exits non-zero or returns no output.
- The validator checks the expected pnpm version before recording a pass.
- Bootstrap verify-only also checks the expected pnpm version before recording
  a pass.
- Value-taking flags reject missing values immediately.
- Bootstrap verify-only returns non-zero when any required tool is missing or
  has a failed version command.

## 2026-06-16: Tailscale Installed Does Not Mean Tailscale Ready

Problem: the VM has the Tailscale package and an active `tailscaled` service,
but `tailscale ip -4` reported `NeedsLogin`.

Correction:

- Treat package install and daemon state as prerequisites only.
- Do not use Tailscale or MagicDNS as the durable SSH target until `tailscale
  ip -4` returns a Tailscale address and the `kendall-linux` SSH alias has been
  tested through the approved stable name.
- Keep the current LAN SSH alias working until Tailscale authentication and
  name resolution are proven.
