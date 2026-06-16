# Platform Evaluation Sprint

Date: 2026-06-15
Status: draft evaluation packet

## Decision Frame

This sprint evaluates whether Kendall_Nxt should keep Windows 11 as the
primary development platform, move primary development to WSL2, or migrate
primary development to a full Linux VM.

The decision must be based on repeatable evidence from the Kendall_Nxt workflow,
not platform preference.

## Options

- Windows 11 native
- WSL2
- Full Linux VM

## Decision Criteria

A platform is viable only if it can support the daily Kendall_Nxt workflow with
low friction, reliable verification, and recoverable failures.

Evaluate each platform against:

- Command reliability
- Shell quoting and scripting predictability
- Node/pnpm workflow stability
- uv/Python supervisor workflow stability
- Playwright/dashboard workflow stability
- GitHub CLI authentication and Git credential behavior
- Codex workspace script reliability
- Startup/session behavior
- Worktree cleanup behavior
- Secret and credential handling
- Agent operability
- Recovery from stale processes or failed runs

Use observable behavior. Avoid "feels better", "cleaner", or "modern". Prefer
"command completed", "failed with", "required manual intervention", "left
residue", or "was recoverable by".

## Sprint Rules

- Run the same checks on each candidate platform where technically possible.
- Record exact commands, results, errors, and manual interventions.
- Do not fix platform-specific issues during the first pass unless the check
  cannot continue.
- If a workaround is required, record it separately from the baseline result.
- Treat authentication, PATH, shell behavior, process cleanup, and startup
  behavior as first-class evidence.
- Prefer short scoped checks over broad repo-wide churn.
- Keep each platform's repo in that platform's native filesystem.
- Do not compare a tuned Windows setup against an untuned Linux setup. Each
  platform gets one documented setup pass, then the sprint measures daily
  operating behavior.

## Scoring Rubric

Score each category from 0 to 3.

| Score | Meaning |
| --- | --- |
| 0 | Blocking: cannot complete the workflow or requires unsafe/manual recovery |
| 1 | Fragile: works only with frequent workarounds or unclear failure modes |
| 2 | Usable: works with minor documented friction |
| 3 | Solid: repeatable, clear, and recoverable |

Migration threshold:

- A new primary platform must beat Windows 11 by at least 20% total score.
- A new primary platform must have no unresolved score of 0 in core workflow,
  auth, or recovery.
- If no platform passes, stop the platform decision and fix repo
  bootstrap/tooling first.

## Environment Snapshot

### Windows 11 Native

| Field | Value |
| --- | --- |
| Date tested | 2026-06-15 |
| Machine / VM | Windows host |
| OS version | Registry reported `Windows 10 Pro 23H2`, build `22631.6199` |
| Shell | PowerShell |
| Repo path | `C:\Users\slaw_dawg\Kendall_Nxt` |
| Node version | `v24.16.0` |
| pnpm version | `11.5.2` |
| uv version | `uv 0.11.19` |
| Python supervisor interpreter | `services\supervisor\.venv\Scripts\python.exe`, Python `3.12.13` |
| Git version | `git version 2.54.0.windows.1` |
| gh version | `gh version 2.93.0` |
| Browser / Playwright notes | `pnpm.cmd exec playwright --version` reported `Version 1.60.0` |
| Credential manager | `gh auth status` authenticated as `slawdawg`; Git protocol `https`; private repo probe passed later in the packet |
| Notes | First Windows baseline pass recorded in evidence IDs `PE-001` through `PE-004`. |

### WSL2

| Field | Value |
| --- | --- |
| Date tested | 2026-06-15 setup attempt through authenticated real-clone follow-up |
| Machine / VM | Windows host WSL subsystem |
| Distro / OS version | Ubuntu WSL2 eventually registered after VMware runtime reload; earlier blocked state is preserved in `PE-005` through `PE-015` as historical evidence. |
| Shell | Bash |
| Repo path | `/root/src/Kendall_Nxt_real` for the real authenticated WSL clone |
| Node version | `v22.22.1` |
| pnpm version | `11.5.2` |
| uv version | `uv 0.11.21` after WSL-local PATH fix |
| Python supervisor interpreter | uv-managed CPython `3.12.13` in the real WSL clone |
| Git version | `git version 2.53.0` |
| gh version | `gh version 2.46.0` installed from Ubuntu `resolute/universe`; authenticated after approved credential setup |
| Browser / Playwright notes | `pnpm exec playwright --version` reported `Version 1.60.0`; dashboard dev server reached Ready on port `3100` in 654ms and stopped without stale Node residue |
| Credential manager | `gh` authenticated as `slawdawg` under `/root/.config/gh/hosts.yml`; `gh auth setup-git` configured Git HTTPS credentials |
| Notes | WSL2 startup, local runtime, private GitHub auth, real Linux-filesystem clone, full `pnpm run check`, and temporary Codex workspace lifecycle smoke are complete. WSL remains operationally weaker than Windows for Windows-hosted agent command quoting and initial setup friction. |

### Full Linux VM

| Field | Value |
| --- | --- |
| Date tested | 2026-06-15 host readiness probe, SSH candidate probe, and SSH login baseline |
| Machine / VM | Current Windows environment is itself a VMware VM; SSH candidate at `192.168.1.6` |
| Distro / OS version | Ubuntu 26.04 LTS; kernel `7.0.0-22-generic` |
| Shell | `/bin/bash` |
| Repo path | `/home/slaw_dawg/Kendall_Nxt` |
| Node version | `v24.16.0` |
| pnpm version | `11.5.2` inside the repo via Corepack package-manager pin |
| uv version | `uv 0.11.21` at `/home/slaw_dawg/.local/bin/uv` |
| Python supervisor interpreter | uv-managed CPython `3.12.13` in `services/supervisor/.venv` |
| Git version | `git version 2.53.0` |
| gh version | `gh version 2.94.0` |
| Browser / Playwright notes | `pnpm exec playwright --version` reported `Version 1.60.0`; dashboard dev server reached Ready on port `3100` in 199ms and stopped without stale Node residue |
| Credential manager | `gh` authenticated as `slawdawg` under `/home/slaw_dawg/.config/gh/hosts.yml`; Git HTTPS private repo probe passed non-interactively |
| Notes | SSH public-key auth works for `slaw_dawg@192.168.1.6`. After Bob completed the interactive package setup, the Linux VM has the required Node/pnpm/uv/gh toolchain, a native Linux clone, passing setup/preflight/full check, and a passing temporary Codex workspace lifecycle smoke. Plain non-interactive `uv --version` now passes after the system-visible uv symlink fix in `PE-035`. |

## Baseline Checks

For each platform, run each check and record the result.

| Check | Windows 11 Command | WSL2 Command | Linux VM Command | Pass Criteria | Windows 11 | WSL2 | Linux VM |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Confirm repo location | `Get-Location` | `pwd` | `pwd` | Correct Kendall_Nxt path in native filesystem | Pass: `C:\Users\slaw_dawg\Kendall_Nxt` | Blocked: no Ubuntu distro registered after reboot; WSL2 VM creation fails in current VMware guest | Blocked in current Windows guest; separate Linux VM required |
| Git status | `git status --short --branch` | `git status --short --branch` | same | Branch is correct and dirty state is understood | Pass: `main...origin/main`; only `docs/platform-evaluation-sprint.md` untracked | | |
| Git diff scope | `git diff --stat` | `git diff --stat` | same | Completes without pager, stale process, or ambiguity | Pass: no tracked diff | | |
| Node available | `node --version` | `node --version` | same | Version prints directly | Pass: `v24.16.0` | | |
| pnpm available | `pnpm --version` | `pnpm --version` | same | Version prints directly | Pass: `11.5.2` | | |
| uv available | `uv --version` | `uv --version` | same | Version prints directly | Pass: `0.11.19` | | |
| gh available | `gh --version` | `gh --version` | same | Version prints directly | Pass: `2.93.0` | | |
| Git available | `git --version` | `git --version` | same | Version prints directly | Pass: `2.54.0.windows.1` | | |
| Supervisor Python available | `services\supervisor\.venv\Scripts\python.exe --version` | `uv run --directory services/supervisor python --version` | same as WSL2 | Version prints without environment repair | Pass: Python `3.12.13` | | |
| Install / dependency health | `pnpm.cmd install --frozen-lockfile` | `pnpm install --frozen-lockfile` | same as WSL2 | Completes with no lockfile mutation | | Pass: already up to date in 394ms from copied eval tree | |
| Preflight | `node ./scripts/preflight.mjs` | same | same | Exits 0 twice in a row or fails with clear actionable cause | Pass: preflight passed in about 1.3s | | |
| Project check | `pnpm.cmd run check` | `pnpm run check` | same as WSL2 | Completes or fails for product reasons, not platform reasons | Pass: full check passed in about 224s; 205 supervisor tests passed with 1 warning | Pass from real WSL clone in about 142s; 205 supervisor tests passed with 1 warning | |
| Dashboard build | `pnpm.cmd --filter @kendall/dashboard build` | `pnpm --filter @kendall/dashboard build` | same as WSL2 | Build completes or fails clearly | Pass: build passed in about 24s standalone; also passed inside full check | | |
| Supervisor tests | `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests` | `uv run --directory services/supervisor pytest tests` | same as WSL2 | Tests run without interpreter/PATH confusion | Pass with adjusted timeout: `205 passed, 1 warning in 202.96s`; initial 120s command timeout was inconclusive | | |
| GitHub auth | `gh auth status` | `gh auth status` | same | Auth status is clear and usable | Pass: authenticated as `slawdawg` via hosts.yml | Pass after token bridge: authenticated as `slawdawg` via `/root/.config/gh/hosts.yml` | |
| Git credential behavior | `git ls-remote origin HEAD` | `git ls-remote origin HEAD` | same | No interactive prompt; exits 0 | Pass: `origin HEAD` resolved to `9f326b3...` non-interactively | Pass after `gh auth setup-git`: private repo `HEAD` resolved to `9f326b3...` non-interactively | |
| Workspace doctor | `node ./scripts/codex-workspace.mjs doctor` | same | same | Required capabilities are green; warnings are explainable | Pass: git/node/gh, repo, hooks, remote, state root, and closed workspace records reported OK | Pass from real clone after setting `core.hooksPath=.githooks`; only initial state-root warning before first workspace start | |
| Workspace start | `node ./scripts/codex-workspace.mjs start "pilot env smoke" --mode experiment` | same | same | Worktree is created under expected local state root | | Pass using temporary WSL state root and worktree under `/tmp` | |
| Workspace list | `node ./scripts/codex-workspace.mjs list` | same | same | New task appears exactly once | | Pass: temporary smoke task appeared once as active | |
| Workspace resume | `node ./scripts/codex-workspace.mjs resume "pilot env smoke"` | same | same | Path is valid and branch checkout is correct | | Pass: resume printed valid `/tmp/...` worktree path and branch | |
| Worktree cleanup dry run | `node ./scripts/codex-workspace.mjs cleanup-merged` | same | same | Deletes nothing and clearly reports eligibility | | Not applicable to experiment smoke; temporary WSL worktree/branch/state root were removed and verified clean | |
| Playwright readiness | `pnpm.cmd exec playwright --version` | `pnpm exec playwright --version` | same as WSL2 | Command resolves without package-manager repair | Pass: `Version 1.60.0` | | |
| Dashboard dev server | `pnpm.cmd --filter @kendall/dashboard dev` | `pnpm --filter @kendall/dashboard dev` | same as WSL2 | Ready URL appears and process stops cleanly | | Pass: `PORT=3100` dev server reached Ready in 654ms and timeout stop left no WSL Node residue | |
| Port/process cleanup | `Get-Process node -ErrorAction SilentlyContinue` | `pgrep -af node` | same as WSL2 | No stale repo dev process remains after stop | Partial: existing dashboard/supervisor/Codex node/python processes are running; no cleanup attempted | | |
| PowerShell quoting stress | `node -e "console.log(JSON.stringify({ok:true,path:process.cwd()}))"` | N/A | N/A | Exact JSON prints without escaping churn | Pass: exact JSON printed with Windows path | | |
| POSIX quoting stress | N/A | `node -e 'console.log(JSON.stringify({ok:true,path:process.cwd()}))'` | same as WSL2 | Exact JSON prints without escaping churn | | Fail: repeated PowerShell-to-WSL quote loss/parser errors; routed to Tool Churn RCA and parked | |
| File watcher smoke | Start dashboard dev server, edit one dashboard source file, observe reload | same | same | Reload happens once and no watcher errors appear | | | |
| Startup equivalent | Inspect Windows scheduled startup path | Inspect shell/profile/systemd user approach if used | Inspect systemd user/service approach if used | Startup is inspectable, user-scoped, and logs are easy to find | | | |
| Git/Vim residue check | `Get-Process git,vim,nvim,node -ErrorAction SilentlyContinue` | `pgrep -af 'git|vim|nvim|node'` | same as WSL2 | No stale process blocks Git/worktree operations | Initial Fail/High: 246 long-lived `git.exe` processes found; follow-up Pass: no `git.exe`, `vim.exe`, or `nvim.exe` processes remained | Pass after simplified probes: no persistent WSL Git, Node, Vim, or Neovim process beyond the active probe commands | |

## Repeated Run Requirement

| Environment | Required Repetition | Pass Criteria |
| --- | ---: | --- |
| Windows 11 | 3 full runs | No sandbox runner timeout, no quoting retry, no PATH repair, no stale process cleanup needed |
| WSL2 | 3 full runs | No Windows interop path confusion, no credential prompt, no file watcher instability |
| Linux VM | 3 full runs | No missing GUI/browser dependency for Playwright/dashboard, no auth prompt, clean process shutdown |

## Failure Taxonomy

Severity:

- `BLOCKER`: prevents normal development or delivery.
- `HIGH`: frequent workaround required, risks corrupting state, auth, or evidence.
- `MEDIUM`: slows workflow but has a documented workaround.
- `LOW`: cosmetic, rare, or one-time setup issue.

Failure type:

- `QUOTING`
- `PATH`
- `AUTH`
- `PROCESS`
- `FILESYSTEM`
- `PERFORMANCE`
- `BROWSER`
- `WORKTREE`
- `SANDBOX`
- `STARTUP`
- `CLEANUP`
- `DOCS/RUNBOOK`

Each failure record must include platform, command or workflow attempted,
expected result, actual result, reproducibility, recovery steps, time lost,
whether repo changes were left behind, whether credentials or auth were
affected, and confidence impact.

## Evidence Records

Use one block per failed or notable check.

### PE-___: Short Title

| Field | Value |
| --- | --- |
| Platform | |
| Check | |
| Command | |
| Start time | |
| Result | Pass / Fail / Blocked / Not applicable |
| Duration | |
| Exit code | |
| Output summary | |
| Error summary | |
| Manual intervention required | None / Describe |
| Workaround attempted | No / Describe |
| Recovery required | None / Describe |
| Residue left behind | None / Processes / Files / Worktrees / Auth state / Other |
| Evidence link or log path | |
| Severity | Low / Medium / High / Blocking |
| Failure type | QUOTING / PATH / AUTH / PROCESS / FILESYSTEM / PERFORMANCE / BROWSER / WORKTREE / SANDBOX / STARTUP / CLEANUP / DOCS/RUNBOOK |
| Decision impact | |

Summarize the smallest useful facts. Do not paste long logs unless they are
needed to diagnose the failure.

### PE-001: Windows Toolchain Baseline Passed

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | Environment snapshot and direct tool resolution |
| Command | `Get-Location`, `node --version`, `pnpm --version`, `uv --version`, `git --version`, `gh --version`, `services\supervisor\.venv\Scripts\python.exe --version` |
| Start time | 2026-06-15 current session |
| Result | Pass |
| Duration | Individual commands completed within seconds |
| Exit code | 0 |
| Output summary | Repo path was `C:\Users\slaw_dawg\Kendall_Nxt`; Node `v24.16.0`; pnpm `11.5.2`; uv `0.11.19`; Git `2.54.0.windows.1`; gh `2.93.0`; supervisor Python `3.12.13`. |
| Error summary | None |
| Manual intervention required | None |
| Workaround attempted | No |
| Recovery required | None |
| Residue left behind | None |
| Evidence link or log path | Current session command output |
| Severity | Low |
| Failure type | DOCS/RUNBOOK |
| Decision impact | Windows direct tool availability is healthy for this baseline pass. |

### PE-002: Windows Verification Baseline Passed

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | Preflight, dashboard build, supervisor tests, and full project check |
| Command | `node ./scripts/preflight.mjs`; `pnpm.cmd --filter @kendall/dashboard build`; `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests -q`; `pnpm.cmd run check` |
| Start time | 2026-06-15 current session |
| Result | Pass |
| Duration | Preflight about 1.3s; dashboard build about 24s standalone; supervisor tests about 203s; full check about 224s |
| Exit code | 0 for successful runs |
| Output summary | Preflight passed. Dashboard build passed. Supervisor tests passed with `205 passed, 1 warning`. Full `pnpm.cmd run check` passed, including dashboard build and supervisor tests. |
| Error summary | Initial supervisor test command with a 120s timeout produced no useful test output and was treated as inconclusive; retry with 300s timeout passed. |
| Manual intervention required | Timeout adjustment for full supervisor test measurement |
| Workaround attempted | Yes: reran pytest with `-q` and a longer command timeout |
| Recovery required | None |
| Residue left behind | None observed from verification commands |
| Evidence link or log path | Current session command output |
| Severity | Medium |
| Failure type | DOCS/RUNBOOK |
| Decision impact | Windows can pass the full verification path, but the supervisor suite needs a timeout budget above 120s for reliable measurement. |

### PE-003: Windows GitHub Auth Passed

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | GitHub CLI auth |
| Command | `gh auth status` |
| Start time | 2026-06-15 current session |
| Result | Pass |
| Duration | Completed within seconds |
| Exit code | 0 |
| Output summary | Authenticated to `github.com` as `slawdawg`; Git operations protocol is `https`; private repo access was verified separately without recording token details. |
| Error summary | None |
| Manual intervention required | None |
| Workaround attempted | No |
| Recovery required | None |
| Residue left behind | None |
| Evidence link or log path | Current session command output |
| Severity | Low |
| Failure type | AUTH |
| Decision impact | Windows GitHub CLI auth is currently usable. Credential persistence after reboot remains untested in this sprint packet. |

### PE-004: Windows Process Residue Found

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | Git/Vim/process residue |
| Command | `Get-Process git,vim,nvim,node,python -ErrorAction SilentlyContinue`; `Get-CimInstance Win32_Process` summary |
| Start time | 2026-06-15 current session |
| Result | Fail |
| Duration | Completed within seconds |
| Exit code | Process query returned output; first query exited non-zero because some requested process names were absent |
| Output summary | Found 246 `git.exe`, 7 `node.exe`, and 2 `python.exe` processes. Git command groups included 70 `git.exe config --null --get core.fsmonitor`, 67 `remote -v`, 63 `rev-parse HEAD`, 34 `status --porcelain`, and 12 `rev-parse --git-dir`. Old Python processes are the running supervisor dev server; old Node processes include Codex, MCP servers, and dashboard. |
| Error summary | No Vim process was present; no old rebase editor chain was present. |
| Manual intervention required | None during measurement |
| Workaround attempted | No cleanup attempted during evaluation |
| Recovery required | Pending separate decision; this packet records the residue as evidence only |
| Residue left behind | Processes |
| Evidence link or log path | Current session process query output |
| Severity | High |
| Failure type | PROCESS |
| Decision impact | Windows baseline has a significant process-residue concern even while verification passes. This is a major comparison point for WSL2 and Linux VM. |

### PE-005: WSL2 Readiness Initially Blocked

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | WSL feature and distro readiness |
| Command | `wsl.exe --status`; `wsl.exe --list --verbose`; `wsl.exe -l -v`; `Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss`; `Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux`; `Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform` |
| Start time | 2026-06-15 current session |
| Result | Blocked |
| Duration | Completed within seconds |
| Exit code | WSL status/list commands exited non-zero; optional feature checks exited 0 |
| Output summary | `wsl.exe` exists, but installed-distro list commands printed WSL usage instead of distro state. The per-user `Lxss` registry key was absent. `Microsoft-Windows-Subsystem-Linux` and `VirtualMachinePlatform` are both `Disabled`. |
| Error summary | No initialized WSL2 environment is available for this user. A first-run WSL2 pilot cannot proceed without enabling Windows features, installing a distro, and likely rebooting. |
| Manual intervention required | Yes: enable WSL/VirtualMachinePlatform, install distro, initialize user, then clone repo into the WSL filesystem |
| Workaround attempted | No |
| Recovery required | N/A |
| Residue left behind | None |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | WSL2 was not ready before setup. Follow-up setup was attempted in `PE-007`. |

### PE-006: Linux VM Pilot Requires Separate Host-Level VM

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Host virtualization and VM tooling readiness from current Windows environment |
| Command | `Get-Command vmrun.exe`; installed-program query for VMware/VirtualBox/Hyper-V; `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor` |
| Start time | 2026-06-15 current session |
| Result | Blocked in current guest |
| Duration | Completed within seconds |
| Exit code | Read-only commands completed; `vmrun.exe` not found |
| Output summary | Current environment reports `Manufacturer=VMware, Inc.`, `Model=VMware20,1`, `HypervisorPresent=True`, and about 16 GB RAM. Installed programs show VMware Tools only. CPU virtualization exposure reports `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. |
| Error summary | The current Windows VM does not expose nested virtualization and does not have VMware Workstation management tools available. |
| Manual intervention required | Yes: create or access a separate Linux VM at the VMware host level, or reconfigure the host/guest for nested virtualization before testing inside this Windows VM |
| Workaround attempted | No |
| Recovery required | N/A |
| Residue left behind | None |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | The Linux VM option remains viable, but it cannot be fairly evaluated from inside the current Windows guest without host-level VM provisioning. |

### PE-007: WSL2 Feature Enablement And Ubuntu Install Attempted

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Enable WSL features and install Ubuntu |
| Command | `Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -All`; `Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -All`; `wsl.exe --install -d Ubuntu --no-launch`; `wsl.exe --list` |
| Start time | 2026-06-15 current session |
| Result | Blocked pending reboot |
| Duration | Feature enablement about 15s; Ubuntu install command about 19s |
| Exit code | Feature enablement and install command exited 0; `wsl.exe --list` exited non-zero pre-reboot |
| Output summary | Both Windows optional features were enabled. `wsl.exe --install -d Ubuntu --no-launch` reported WSL and Ubuntu installed, then stated changes will not be effective until reboot. Before reboot, `wsl.exe --list` still reports no installed distributions. |
| Error summary | WSL cannot be evaluated in the current session. A reboot is required before Ubuntu first-run initialization and native WSL filesystem testing. |
| Manual intervention required | Yes: reboot Windows, launch Ubuntu first-run setup, create Linux user, then clone Kendall_Nxt inside the WSL filesystem |
| Workaround attempted | No |
| Recovery required | Reboot |
| Residue left behind | Enabled Windows optional features; pending WSL/Ubuntu installation state |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | WSL2 has moved from unavailable to setup-pending. The next evaluation step is a reboot and Ubuntu initialization; no workflow score should be assigned until after that. |

### PE-008: WSL2 Ubuntu Registration Blocked After Reboot

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Post-reboot WSL2 and Ubuntu readiness |
| Command | `wsl.exe --status`; `wsl.exe --list --verbose`; `Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux`; `Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform`; `wsl.exe --install -d Ubuntu --no-launch`; `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor`; `wsl.exe --list --verbose` |
| Start time | 2026-06-15 13:50:06 -05:00 |
| Result | Blocked |
| Duration | Status and feature checks completed within seconds; Ubuntu install retry failed after about 9s |
| Exit code | `wsl.exe --status` exited 0; `wsl.exe --list --verbose` exited 1; optional feature checks exited 0; `wsl.exe --install -d Ubuntu --no-launch` exited 1 |
| Output summary | WSL default version is `2`. `Microsoft-Windows-Subsystem-Linux` and `VirtualMachinePlatform` are both `Enabled`. Ubuntu download/install started, but registration failed before any distro was listed. The current environment reports `Manufacturer=VMware, Inc.`, `Model=VMware20,1`, `HypervisorPresent=True`, and about 16 GB RAM. |
| Error summary | `wsl.exe --list --verbose` reports no installed distributions. Ubuntu registration fails with `WSL2 is unable to start since virtualization is not enabled on this machine` and error code `Wsl/InstallDistro/Service/RegisterDistro/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED`. CPU virtualization exposure reports `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. |
| Manual intervention required | Yes: expose nested virtualization / required hypervisor support to this Windows VM, or evaluate WSL2 on a physical Windows host or host-level VM that supports WSL2 VM creation |
| Workaround attempted | Yes: reran the documented Ubuntu install command after reboot; no distro registered |
| Recovery required | Host or VM configuration change before WSL2 can initialize Ubuntu |
| Residue left behind | Enabled Windows optional features; no installed WSL distributions reported after the failed retry |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | WSL2 cannot enter baseline testing in the current VMware guest. This does not disqualify WSL2 generally, but it blocks comparison from this machine until virtualization support is exposed or testing moves to a different Windows host. |

### PE-009: WSL2 Still Blocked Before Host VM Setting Change

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Continuation check after reboot blocker |
| Command | `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor`; `wsl.exe --status`; `wsl.exe --list --verbose` |
| Start time | 2026-06-15 13:54:25 -05:00 |
| Result | Blocked |
| Duration | Completed within seconds |
| Exit code | CPU and WSL status checks exited 0; `wsl.exe --list --verbose` exited 1 |
| Output summary | Current environment still reports `Manufacturer=VMware, Inc.`, `Model=VMware20,1`, and `HypervisorPresent=True`. `wsl.exe --status` still reports default version `2`. |
| Error summary | CPU virtualization exposure remains unavailable inside the Windows guest: `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. `wsl.exe --list --verbose` still reports no installed distributions. |
| Manual intervention required | Yes: power off the Windows VM completely and enable nested virtualization / VT-x/EPT support in VMware before retrying Ubuntu registration |
| Workaround attempted | No: Ubuntu registration was not retried because the host evidence still shows the same WSL2 VM-creation blocker |
| Recovery required | Host or VM configuration change before WSL2 can initialize Ubuntu |
| Residue left behind | None from this continuation check |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | WSL2 remains blocked on host-level virtualization exposure. The next useful action is host/VMware configuration inspection, not another WSL install command. |

### PE-010: VMware Settings Change Did Not Expose Nested Virtualization

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Follow-up after reported VMware nested virtualization settings change |
| Command | `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor`; `bcdedit /enum {current}`; `Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard`; `systeminfo.exe`; `wsl.exe --version`; `Get-WindowsOptionalFeature -Online -FeatureName ...`; `wsl.exe --list --verbose` |
| Start time | 2026-06-15 13:57:55 -05:00 |
| Result | Blocked |
| Duration | Completed within seconds |
| Exit code | Read-only diagnostic commands exited 0 except `wsl.exe --list --verbose`, which exited 1 because no distributions are installed |
| Output summary | The guest boot time is `2026-06-15 13:52:16`, after the prior blocker record. Windows reports VMware virtual hardware and the physical CPU model, WSL version `2.7.8.0`, kernel `6.18.33.1-1`, Windows `10.0.22631.6199`, `Microsoft-Windows-Subsystem-Linux=Enabled`, and `VirtualMachinePlatform=Enabled`. `Microsoft-Hyper-V-All` is disabled. |
| Error summary | The guest still reports `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. `wsl.exe --list --verbose` still reports no installed distributions. Device Guard reports `VirtualizationBasedSecurityStatus=2` with no specific configured/running security services. |
| Manual intervention required | Yes: inspect the VMware host and VM configuration because the changed settings are not being exposed to the Windows guest as VT-x/EPT/SLAT support |
| Workaround attempted | No: Windows-side WSL registration was not retried because the required CPU flags are still absent |
| Recovery required | Confirm the VM was fully powered off rather than suspended; verify the VMware processor setting that virtualizes Intel VT-x/EPT or AMD-V/RVI is enabled; verify the host can provide nested virtualization and is not running in a mode that prevents VMware from exposing it |
| Residue left behind | None from this diagnostic pass |
| Evidence link or log path | Current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | The blocker has moved from "settings may need to be changed" to "settings change did not take effect or cannot be honored." WSL2 cannot enter baseline testing until the guest reports the required CPU virtualization features as `True`. |

### PE-011: VMware Host Supports Virtualization But Guest Still Does Not

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Host virtualization capability supplied by Bob plus guest re-check |
| Command | Host: `systeminfo`; Guest: `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor` |
| Start time | 2026-06-15 14:03:33 -05:00 |
| Result | Blocked |
| Duration | Guest check completed within seconds |
| Exit code | Guest read-only diagnostic command exited 0 |
| Output summary | Host `BOB` is an ASUS Windows 11 Pro machine with Intel i9-12900K. Host `systeminfo` reports `Virtualization-based security: Status: Not enabled` and Hyper-V requirements all available: VM Monitor Mode Extensions `Yes`, Virtualization Enabled In Firmware `Yes`, Second Level Address Translation `Yes`, and DEP `Yes`. Bob also confirmed `vhv.enable = "TRUE"` in the VMX file, VMware's Intel VT-x/EPT or AMD-V/RVI option is enabled, and virtualize IOMMU is enabled. |
| Error summary | The Windows guest still reports `Manufacturer=VMware, Inc.`, `Model=VMware20,1`, `HypervisorPresent=True`, but `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. |
| Manual intervention required | Yes: inspect VMware's effective runtime/config for this VM, especially `vmware.log`, VM compatibility/hardware version, whether the VM was suspended rather than cold-started after the setting change, and whether Workstation is actually using a mode that exposes nested virtualization. |
| Workaround attempted | No: WSL registration was not retried because the guest still lacks the required CPU virtualization features. |
| Recovery required | Make the VMware guest report the required CPU virtualization features as `True`, or move WSL2 baseline testing to the physical Windows host / a different VM strategy. |
| Residue left behind | None from this diagnostic pass |
| Evidence link or log path | Bob-provided host `systeminfo` output and current session guest command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | Host BIOS/SLAT/VBS no longer appears to be the limiting factor. The blocker is now the gap between configured VMware nested virtualization and what the Windows guest actually receives. |

### PE-012: VMware Log Shows Running VMX Did Not Load Nested Virtualization Setting

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Bob-provided VMware runtime log inspection |
| Date tested | 2026-06-15 VMware log review |
| Command | `Select-String` over `docs/vmware-0.log` for `vhv`, `virtualHW.version`, VMX configuration, power, suspend/resume, and CPUID lines |
| Expected result | The effective VMX configuration loaded by VMware includes `vhv.enable = "TRUE"` or an equivalent nested virtualization setting, followed by a fresh guest boot where CPU virtualization flags can be exposed. |
| Output summary | `docs/vmware-0.log` starts with VMware Workstation `26.0.0 build=25388281` loading `C:\Users\slaw_\VMs\Kendall_vNxt\Kendall_vNxt.vmx` on `2026-06-12T13:28:22Z`. The loaded configuration block reports `virtualHW.version = "22"`, `guestOS = "windows11-64"`, `numvcpus = "8"`, and EFI secure boot, but no `vhv.enable` entry. The only `vhv` matches are overhead memory labels, not configuration. The same `vmware-vmx.exe` process continues into June 15 and records a guest-requested power off ending at `2026-06-15T18:52:01Z`. |
| Error summary | The log does not prove VMware rejected nested virtualization; it proves this captured VMX runtime did not load `vhv.enable = "TRUE"`. If the VMX file was edited while the VM was suspended/running, the edit was not active for the failing guest checks. |
| Manual intervention required | Yes: from the VMware host, fully power off the VM, close the running VMX process, verify the VMX file contains `vhv.enable = "TRUE"` for the exact path `C:\Users\slaw_\VMs\Kendall_vNxt\Kendall_vNxt.vmx`, start the VM cold, then collect a fresh `vmware.log` and guest CPU flag check. |
| Workaround attempted | No: WSL registration remains gated until the guest CPU flags become true. |
| Recovery required | Cold-start the VM after confirming the setting is in the active VMX file, or move WSL2 baseline testing to the physical Windows host / a different VM strategy. |
| Residue left behind | None from this log review |
| Evidence link or log path | `docs/vmware-0.log` |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | The next useful action is not another WSL retry. It is a host-side cold-start/config reload proof that the active VMware runtime actually loaded `vhv.enable`, followed by the guest retry gate below. |

### PE-013: Copied VMX Confirms Desired Nested Virtualization Settings But Guest Still Lacks Flags

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Static VMX review plus current guest CPU exposure re-check |
| Date tested | 2026-06-15 14:28:57 -05:00 |
| Command | `Get-Content -Raw docs\Kendall_vNxt.vmx`; `Select-String -Path docs\Kendall_vNxt.vmx -Pattern 'virtualHW.version\|guestOS\|numvcpus\|memsize\|vvtd.enable\|vhv.enable\|cleanShutdown\|softPowerOff'`; `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor`; `wsl.exe --status` |
| Expected result | The active VMX file contains `vhv.enable = "TRUE"` and the freshly booted Windows guest reports nested virtualization CPU features as available. |
| Output summary | The copied VMX at `docs\Kendall_vNxt.vmx` reports `virtualHW.version = "22"`, `guestOS = "windows11-64"`, `numvcpus = "8"`, `memsize = "16384"`, `vvtd.enable = "TRUE"`, and `vhv.enable = "TRUE"`. The file also reports `cleanShutdown = "FALSE"` and `softPowerOff = "FALSE"`. WSL still reports default version `2`. |
| Error summary | The current Windows guest still reports `Manufacturer=VMware, Inc.`, `Model=VMware20,1`, and `HypervisorPresent=True`, but `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. The static VMX copy proves the desired settings are present in the file Bob copied, but it does not prove the running VMware VMX process loaded those settings. |
| Manual intervention required | Yes: fully power off the VM from VMware Workstation, ensure the VM is not merely suspended, close/reopen the VM if needed so the VMX is reloaded, start the guest cold, then copy the fresh `vmware.log` into `docs\` for runtime confirmation. |
| Workaround attempted | No: Ubuntu registration was not retried because the guest CPU flags remain false. |
| Recovery required | Capture a fresh VMware runtime log after the cold start and confirm the effective configuration includes `vhv.enable = "TRUE"` before retrying WSL2 distro registration. |
| Residue left behind | `docs\Kendall_vNxt.vmx` is a copied diagnostic artifact. |
| Evidence link or log path | `docs\Kendall_vNxt.vmx` and current session command output |
| Severity | Blocking |
| Failure type | STARTUP |
| Decision impact | The blocker is no longer whether the copied VMX text contains the nested virtualization settings; it is whether VMware Workstation reloads and honors them for the live guest. |

### PE-014: Fresh VMware Runtime Loads Nested Virtualization Settings

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Fresh `vmware-0.log` review plus current guest posture check |
| Date tested | 2026-06-15 latest VMware log follow-up |
| Command | `Select-String -Path docs\vmware-0.log -Pattern ...`; `Get-CimInstance Win32_ComputerSystem`; `Get-CimInstance Win32_Processor`; `bcdedit /enum {current}` via `bcdedit.exe`; `Get-WindowsOptionalFeature`; `Get-CimInstance ... Win32_DeviceGuard`; `wsl.exe --status`; `wsl.exe --list --verbose` |
| Expected result | The fresh VMware runtime log includes `DICT vhv.enable = "TRUE"` and `DICT vvtd.enable = "TRUE"`, and the guest can proceed to a bounded WSL2 distro registration retry. |
| Output summary | The fresh log starts a new `vmware-vmx.exe` process on `2026-06-15T18:52:10Z` for `C:\Users\slaw_\VMs\Kendall_vNxt\Kendall_vNxt.vmx`. The loaded configuration dictionary includes `virtualHW.version = "22"`, `guestOS = "windows11-64"`, `numvcpus = "8"`, `memsize = "16384"`, `vvtd.enable = "TRUE"`, and `vhv.enable = "TRUE"`. The log reports `Monitor Mode: CPL0`, `IOPL_VBSRunning: VBS is set to 0`, host VT-x/EPT capabilities, guest VT-x/EPT capabilities, and `Hyper-V guest: management OS identified`. Windows boot config reports `hypervisorlaunchtype Auto`; WSL and Virtual Machine Platform are enabled; full Hyper-V, Windows Hypervisor Platform, and Disposable Client VM are disabled. |
| Error summary | Guest WMI still reports `VirtualizationFirmwareEnabled=False`, `SecondLevelAddressTranslationExtensions=False`, and `VMMonitorModeExtensions=False`. Device Guard reports `VirtualizationBasedSecurityStatus=2` with no specific configured/running security services. `wsl.exe --list --verbose` still reports no installed distributions. |
| Manual intervention required | No further VMware config edit is indicated by this log. The next decision is whether to retry bounded Ubuntu registration now that VMware has loaded the nested virtualization settings. |
| Workaround attempted | No: Ubuntu registration was not retried in this pass because it mutates WSL state and should be an explicit next action. |
| Recovery required | If Ubuntu registration still fails with `HCS_E_HYPERV_NOT_INSTALLED`, investigate Windows guest hypervisor/VBS interaction rather than VMX loading; the VMware runtime now shows the nested virtualization settings are active. |
| Residue left behind | `docs\vmware-0.log` is a copied diagnostic artifact. |
| Evidence link or log path | `docs\vmware-0.log` |
| Severity | Blocking until registration retry proves success or produces the next concrete error |
| Failure type | STARTUP |
| Decision impact | The previous blocker, “VMware did not load `vhv.enable`,” is resolved. The next useful action is a controlled WSL2 Ubuntu registration retry, despite the WMI CPU flags remaining false, because the VMware runtime log now shows guest VT-x/EPT capability and Windows has started its Hyper-V management OS layer. |

### PE-015: WSL2 Ubuntu Registration Succeeds After VMware Runtime Reload

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Bounded Ubuntu registration retry after fresh VMware runtime confirmed `vhv.enable` |
| Date tested | 2026-06-15 14:34:50 -05:00 |
| Command | `wsl.exe --install -d Ubuntu --no-launch`; `wsl.exe --list --verbose`; `wsl.exe -d Ubuntu -- true`; `wsl.exe -d Ubuntu -- uname -a` |
| Expected result | Ubuntu registers as a WSL2 distro and can start a non-interactive command without `HCS_E_HYPERV_NOT_INSTALLED`. |
| Output summary | Ubuntu downloaded and installed successfully. `wsl.exe --list --verbose` reports `Ubuntu` as the default distro, `Stopped`, version `2`. `wsl.exe -d Ubuntu -- true` exits `0`. `uname -a` reports Linux host `KendallVnxt` on kernel `6.18.33.1-microsoft-standard-WSL2` for `x86_64 GNU/Linux`. |
| Error summary | None in this pass. |
| Manual intervention required | No for WSL2 startup. User initialization and repo setup inside the WSL filesystem remain separate baseline tasks. |
| Workaround attempted | No workaround required after VMware runtime reload. |
| Recovery required | If later WSL commands fail, keep the fresh VMware runtime evidence and WSL registration result separate from Linux environment/package setup failures. |
| Residue left behind | Ubuntu WSL2 distro is installed and registered. |
| Evidence link or log path | Current session command output; `docs\vmware-0.log` for preceding runtime proof |
| Severity | Cleared for WSL2 startup |
| Failure type | RESOLVED |
| Decision impact | VMware nested virtualization is now sufficient for WSL2 distro registration. Platform evaluation can move from VMware startup troubleshooting to WSL2 baseline checks and Linux-side repo setup. |

### PE-016: WSL2 Baseline Setup And Full Check Pass With Git Clone Caveat

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Linux-side toolchain setup, repo setup, preflight, dashboard build, and supervisor test baseline |
| Date tested | 2026-06-15 14:58:25 -05:00 |
| Command | `apt-get update`; `apt-get install -y nodejs npm build-essential python3-venv`; `corepack prepare pnpm@11.5.2 --activate`; `npm install -g pnpm@11.5.2`; `curl -LsSf https://astral.sh/uv/install.sh \| sh`; copy Windows worktree to `/root/src/Kendall_Nxt_eval`; `pnpm run setup`; `pnpm run preflight`; `pnpm run check` |
| Expected result | WSL2 can install the repo dependencies, run preflight, build the dashboard, and run supervisor tests from the WSL filesystem. |
| Output summary | Ubuntu runs as WSL2 on kernel `6.18.33.1-microsoft-standard-WSL2`. Git `2.53.0` was present. Ubuntu packages provided Node `v22.22.1`, satisfying the repo `>=22 <25` range. `uv` installed as `0.11.21` under `/root/.local/bin`. Linux-local pnpm `11.5.2` was installed through `npm install -g` after the Ubuntu Corepack path failed. `pnpm run setup` completed: JavaScript dependencies installed, uv downloaded CPython `3.12.13`, created the supervisor `.venv`, and preflight passed. Explicit `pnpm run preflight` passed. Full `pnpm run check` passed, including documentation drift checks, dashboard production build with Next.js `16.2.7`, and supervisor integration tests: `205 passed, 1 warning in 56.57s`. |
| Error summary | Fresh WSL Git clone from `https://github.com/slawdawg/Kendall-vnxt.git` repeatedly timed out and left an invalid partial clone containing only `.git`; `git ls-remote ... HEAD` also timed out, while `curl -I https://github.com` succeeded. Ubuntu-packaged Corepack failed to launch pnpm `11.5.2` with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, so Linux-local pnpm was installed with npm. A PowerShell-to-WSL command shape expanded `$PATH` on the Windows side twice; Tool Churn RCA classified it as `quoting/path-or-tool` and the command was replaced with an explicit Linux PATH. |
| Manual intervention required | No for WSL setup/check execution. Yes if the evaluation requires a fresh Git clone inside WSL rather than a copied working tree. |
| Workaround attempted | The successful baseline used `/root/src/Kendall_Nxt_eval`, copied from the Windows worktree into the WSL filesystem with Git metadata and generated dependency/cache directories excluded. This tests Linux filesystem/tool behavior but does not prove WSL Git remote sync readiness. |
| Recovery required | Investigate WSL Git smart HTTP separately before treating WSL as delivery-ready for clone/fetch/push workflows. Keep WSL repo checks and WSL Git remote sync as separate evaluation lanes. |
| Residue left behind | Ubuntu packages for Node/npm/build tools/Python venv; Linux-local pnpm `11.5.2`; uv under `/root/.local/bin`; partial clone at `/root/src/Kendall_Nxt` with invalid HEAD; working evaluation copy at `/root/src/Kendall_Nxt_eval` with installed dependencies and supervisor `.venv`. |
| Evidence link or log path | Current session command output |
| Severity | WSL repo verification passed; WSL Git remote sync remains blocked |
| Failure type | PARTIAL-PASS |
| Decision impact | WSL2 is viable for local repo verification once toolchain setup is complete. It is not yet proven for fresh clone or GitHub delivery workflows from inside WSL because Git smart HTTP timed out while basic HTTPS worked. |

### PE-017: WSL2 GitHub Remote Sync Blocker Narrows To Credentials

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | GitHub remote probe after PE-016 clone timeout |
| Date tested | 2026-06-15 15:03:06 -05:00 |
| Command | `wsl.exe --list --verbose`; `wsl.exe -d Ubuntu -- bash -lc 'set -e; ... tool versions ...'`; `wsl.exe -d Ubuntu -- bash -lc 'timeout 30s env GIT_CURL_VERBOSE=1 GIT_TRACE_CURL=1 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD'`; `wsl.exe -d Ubuntu -- which gh`; `wsl.exe -d Ubuntu -- which git-credential-manager`; `wsl.exe -d Ubuntu -- which git-credential-oauth`; `wsl.exe -d Ubuntu -- env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD` |
| Expected result | WSL Git can distinguish transport/network failure from missing private-repo authentication. |
| Output summary | Ubuntu is running as WSL2. Linux tools are still present: Git `2.53.0`, Node `v22.22.1`, pnpm `11.5.2`, and uv `0.11.21`. Git curl tracing resolves `github.com`, establishes TLS, negotiates HTTP/2, sends the smart HTTP `git-upload-pack` refs request, and receives `HTTP/2 401` with `www-authenticate: Basic realm="GitHub"`. With prompts disabled, Git fails fast with `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. |
| Error summary | The earlier clone/ls-remote timeout is now narrowed: GitHub transport works, but WSL has no configured non-interactive credential path for this private repository. `gh`, `git-credential-manager`, and `git-credential-oauth` are not installed in WSL. Two PowerShell-to-WSL shell-script shapes still proved fragile because `$PWD`/shell variables expanded or printed incorrectly from the host command boundary; use single-purpose WSL commands or WSL `--cd` instead. |
| Manual intervention required | Yes before WSL can be considered delivery-ready: install/configure an approved WSL GitHub credential path, such as GitHub CLI auth or Git Credential Manager integration, then retry clone/fetch/push probes. |
| Workaround attempted | None for credentials. The session used read-only probes only and did not install `gh`, configure credential helpers, store tokens, clone, fetch, push, or mutate remote state. |
| Recovery required | Keep WSL local verification and WSL GitHub delivery as separate lanes. Next safe action is to choose and approve a WSL credential strategy, then run bounded non-interactive `git ls-remote`, fresh clone, fetch, and push-dry-run-equivalent checks. |
| Residue left behind | No intentional WSL credential or Git remote state changes. |
| Evidence link or log path | Current session command output |
| Severity | WSL local verification viable; WSL GitHub delivery blocked on credentials |
| Failure type | AUTH-BLOCKED |
| Decision impact | WSL2 should no longer be treated as failing Git smart HTTP networking based on the PE-016 timeout alone. The current blocker is absent WSL GitHub authentication for a private repo. |

### PE-018: Windows Git Remote And Workspace Doctor Pass

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | Git credential behavior and Codex workspace protocol readiness |
| Date tested | 2026-06-15 continuation after frozen session |
| Command | `git ls-remote origin HEAD`; `node ./scripts/codex-workspace.mjs doctor` |
| Expected result | Private GitHub repo resolves without an interactive prompt, and workspace protocol prerequisites are green. |
| Output summary | `git ls-remote origin HEAD` returned `9f326b3dcd85100d0b269972819e8e6b40be00af HEAD`. Workspace doctor reported Git, Node, gh, repo detection, origin, hooks, pre-push guard, state root, and all closed workspace records as OK. |
| Error summary | None. |
| Manual intervention required | None. |
| Workaround attempted | No. |
| Recovery required | None. |
| Residue left behind | None. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | AUTH |
| Decision impact | Windows remains delivery-capable for private-repo Git and repo-owned workspace lifecycle checks. |

### PE-019: WSL2 Eval Tree Is Not A Real Git Worktree

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | WSL repo location, direct tool resolution, and workspace doctor from the existing evaluation copy |
| Date tested | 2026-06-15 continuation after frozen session |
| Command | `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- bash -lc 'pwd; git status --short --branch; node --version; pnpm --version; uv --version; git --version'`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- bash -lc 'node ./scripts/codex-workspace.mjs doctor'` |
| Expected result | The WSL evaluation tree is a Linux-filesystem Git worktree with origin, hooks, gh, and workspace readiness. |
| Output summary | The WSL eval path is `/root/src/Kendall_Nxt_eval`; Node `v22.22.1`, pnpm `11.5.2`, uv `0.11.21`, and Git `2.53.0` resolve. Workspace doctor reports Git and Node OK, pre-push guard present, and state root not yet created. |
| Error summary | `git status` fails with `fatal: not a git repository`; no `.git` directory exists under `/root/src`; workspace doctor reports `gh` unavailable, repository worktree detection failed, origin remote missing, and `core.hooksPath` not `.githooks`. |
| Manual intervention required | Yes before WSL can be considered a primary development platform: create a real Linux-filesystem clone with a working private-repo credential path. |
| Workaround attempted | No. The existing copied tree was left unchanged. |
| Recovery required | Install/configure a WSL GitHub credential strategy, perform a fresh clone or equivalent real Git worktree setup inside WSL storage, then rerun workspace doctor, workspace start/list/resume, and Git remote probes. |
| Residue left behind | None from this probe. Existing WSL copied tree remains. |
| Evidence link or log path | Current session command output. |
| Severity | High |
| Failure type | WORKTREE |
| Decision impact | WSL2 has proven build/test capability but has not proven the Git/workspace lifecycle required for primary development. |

### PE-020: Windows Git Process Residue Cleared Without Manual Cleanup

| Field | Value |
| --- | --- |
| Platform | Windows 11 native |
| Check | Follow-up Git/Vim/process residue check |
| Date tested | 2026-06-15 continuation after frozen session |
| Command | `Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('git.exe','node.exe','python.exe','vim.exe','nvim.exe') }` grouped by process name and Git command line |
| Expected result | No stale Git or editor processes remain that could block Git/worktree operations. |
| Output summary | No `git.exe`, `vim.exe`, or `nvim.exe` processes were present. Four `node.exe` and two `python.exe` processes remained, consistent with active dashboard/supervisor/Codex-related services rather than stale Git operations. |
| Error summary | None. |
| Manual intervention required | None. |
| Workaround attempted | No cleanup was attempted. |
| Recovery required | None for Git residue. Keep long-running Node/Python services visible in startup/process runbooks. |
| Residue left behind | Active service processes only. |
| Evidence link or log path | Current session command output. |
| Severity | Medium |
| Failure type | PROCESS |
| Decision impact | The earlier Windows Git process residue was serious but transient in this session. It should remain a monitoring concern, not an immediate migration trigger by itself. |

### PE-021: WSL Host-Boundary Quoting Churn

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | POSIX quoting stress and WSL process residue follow-up |
| Date tested | 2026-06-15 continuation after PE-019 |
| Command | Failed shapes: `wsl.exe -d Ubuntu -- bash -lc '... pgrep -af "git|vim|nvim|node" ...'`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- bash -lc 'node -e ...'`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- node -p ...`. Follow-up process probes used separate literal `pgrep -af git`, `pgrep -af node`, and `pgrep -af vim` commands. |
| Expected result | WSL command invocation preserves intended POSIX quoting and exact Node arguments when launched from the Windows PowerShell agent shell. |
| Output summary | Windows PowerShell quoting stress passed with exact JSON output. WSL tool availability remained unchanged: `gh` produced no path. Separate WSL process probes showed no persistent Git, Node, Vim, or Neovim residue beyond the active probe commands. |
| Error summary | The first WSL process probe lost the regex quotes and attempted to run `vim`/`nvim` pipeline segments. The nested POSIX `node -e` shape produced a PowerShell parser error. The simplified direct WSL `node -p` shape still reached Linux without the intended quoted JavaScript expression and failed with a Bash syntax error near `(`. |
| Manual intervention required | None for recovery; the failed probes were stopped and classified through Tool Churn RCA. |
| Workaround attempted | Yes: switched from a combined regex probe to separate literal process probes. No further inline JavaScript quoting retries were attempted after the direct WSL shape failed. |
| Recovery required | Use repo scripts, checked-in helper commands, or very simple WSL invocations for future cross-boundary probes. Avoid Windows-to-WSL nested inline JavaScript or complex POSIX quote tests unless a wrapper script owns the quoting. See `docs/workflows/wsl-command-boundary.md`. |
| Residue left behind | None observed; no persistent Vim/Node/Git residue remained. |
| Evidence link or log path | Current session command output; `docs/workflows/tool-churn-rca.md` for routing rule. |
| Severity | Medium |
| Failure type | QUOTING |
| Decision impact | WSL2 remains promising inside the Linux environment, but Windows-hosted agent control of WSL commands introduces its own quoting failure class. This reduces WSL's agent-operability score until a wrapper/runbook removes the boundary churn. |

### PE-022: WSL GitHub Credential Setup Gate

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | GitHub credential tool and helper availability |
| Date tested | 2026-06-15 continuation after PE-021 |
| Command | `wsl.exe -d Ubuntu -- apt-cache policy gh`; `wsl.exe -d Ubuntu -- git config --global --get-all credential.helper` |
| Expected result | WSL has a configured non-interactive credential path for private GitHub repo access, or the next setup step is explicit. |
| Output summary | `apt-cache policy gh` reports no installed `gh` package and candidate `2.46.0-4` from Ubuntu `resolute/universe`. `git config --global --get-all credential.helper` returns no configured global helper. |
| Error summary | No credential helper is configured. GitHub CLI is available as an install candidate but is not installed or authenticated. |
| Manual intervention required | Yes: Bob must choose and approve a WSL credential strategy before WSL GitHub delivery checks can continue. |
| Workaround attempted | No. No package installation, token entry, auth flow, credential helper setup, clone, fetch, or push was performed. |
| Recovery required | Use `docs/workflows/wsl-github-credential-options.md` to select a setup path, then rerun WSL `gh auth status`, non-interactive `git ls-remote`, real clone, and Codex workspace lifecycle checks. |
| Residue left behind | None. |
| Evidence link or log path | Current session command output; `docs/workflows/wsl-github-credential-options.md`. |
| Severity | High |
| Failure type | AUTH |
| Decision impact | WSL2 remains blocked for primary development delivery until a credential strategy is installed and authenticated. |

### PE-023: WSL Local Runtime Smoke Completes

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Dependency health, Playwright readiness, dashboard dev server, and process cleanup |
| Date tested | 2026-06-15 continuation after PE-022 |
| Command | `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- pnpm exec playwright --version`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- pnpm install --frozen-lockfile`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- env PORT=3100 timeout 25s pnpm --filter @kendall/dashboard dev`; `wsl.exe -d Ubuntu -- pgrep -af node` |
| Expected result | WSL can resolve Playwright, validate installed dependencies against the lockfile, start the dashboard dev server on an alternate port, and stop without stale Node residue. |
| Output summary | Playwright reported `Version 1.60.0`. `pnpm install --frozen-lockfile` reported all workspace projects already up to date in 394ms. Dashboard dev server started with Next.js `16.2.7`, served `http://localhost:3100`, and reached Ready in 654ms. Follow-up `pgrep -af node` found no WSL Node process. |
| Error summary | The first multi-statement Bash dev-server smoke failed with a quoting/parser error and was replaced with a direct `env PORT=3100 timeout 25s ...` invocation. The direct invocation exits non-zero because `timeout` stops the dev server after evidence is captured. |
| Manual intervention required | None. |
| Workaround attempted | Yes: replaced complex WSL shell script with a direct timeout-wrapped dev-server command per `docs/workflows/wsl-command-boundary.md`. |
| Recovery required | None for local runtime. Future automation should use scripts or direct commands for WSL dev-server probes. |
| Residue left behind | None observed from the dashboard smoke. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | BROWSER |
| Decision impact | WSL2 local runtime is viable for dependency, Playwright, and dashboard dev-server checks from the Linux filesystem eval tree. |

### PE-024: WSL Credential Tool Installed But Delivery Still Blocked

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | GitHub CLI install, auth state, Git credential setup, and public/private remote distinction |
| Date tested | 2026-06-15 continuation after PE-023 |
| Command | `wsl.exe -d Ubuntu -- apt-get install -y gh`; `wsl.exe -d Ubuntu -- gh --version`; `wsl.exe -d Ubuntu -- gh auth status`; `wsl.exe -d Ubuntu -- gh auth setup-git`; `wsl.exe -d Ubuntu -- env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD`; `wsl.exe -d Ubuntu -- env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/cli/cli.git HEAD` |
| Expected result | WSL has the credential tooling needed for a later auth flow, and the remaining delivery blocker is classified precisely. |
| Output summary | `apt-get install -y gh` installed GitHub CLI `2.46.0-4`. `gh --version` reports `gh version 2.46.0`. Public GitHub smart HTTP works: `git ls-remote https://github.com/cli/cli.git HEAD` returned `f15dce85056f12cb83f902ab38a35b358676f612 HEAD`. |
| Error summary | `gh auth status` reports no logged-in GitHub hosts. `gh auth setup-git` refuses to run until `gh auth login` is completed. Private repo probe still fails with `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. |
| Manual intervention required | Yes: WSL requires an authenticated GitHub credential path before private-repo clone/fetch/push or PR delivery can be evaluated. |
| Workaround attempted | Installed tooling only; no authentication, token storage, credential helper setup, private clone, fetch, push, or PR mutation was attempted. |
| Recovery required | Run an approved WSL GitHub auth flow, then perform a fresh clone into the WSL filesystem and rerun workspace doctor/start/list/resume checks. |
| Residue left behind | WSL package `gh` installed. No credential state was created. |
| Evidence link or log path | Current session command output. |
| Severity | High |
| Failure type | AUTH |
| Decision impact | WSL2 local evaluation is complete, but primary-development evaluation remains blocked at the private-repo delivery boundary. Public network transport is healthy; private repo access needs credentials. |

### PE-025: WSL Workspace Doctor Still Blocked By Copied Tree

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Codex workspace doctor after installing `gh` |
| Date tested | 2026-06-15 continuation after PE-024 |
| Command | `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- node ./scripts/codex-workspace.mjs doctor` |
| Expected result | WSL copied tree can prove workspace lifecycle readiness once `gh` is present. |
| Output summary | Doctor reports Git `2.53.0`, Node `v22.22.1`, and gh `2.46.0` OK. The pre-push guard file exists. |
| Error summary | Doctor still fails repository worktree detection, origin remote, and `core.hooksPath` because `/root/src/Kendall_Nxt_eval` is a copied source tree without `.git`, not a real clone. State root does not exist yet, which is expected before first workspace start. |
| Manual intervention required | Yes: authenticate WSL GitHub access and create a real Linux-filesystem clone before workspace lifecycle can be tested fairly. |
| Workaround attempted | No. The copied eval tree was not converted into a fake Git repo because that would not prove fresh clone or delivery readiness. |
| Recovery required | After auth, clone `Kendall-vnxt` into WSL storage, run `pnpm run setup`, then run `node ./scripts/codex-workspace.mjs doctor`, `start --mode experiment`, `list`, and `resume`. |
| Residue left behind | None from doctor. |
| Evidence link or log path | Current session command output. |
| Severity | High |
| Failure type | WORKTREE |
| Decision impact | WSL2 cannot be recommended as primary until a real WSL clone passes workspace lifecycle checks. |

### PE-026: WSL Authenticated Real Clone And Full Check Pass

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | WSL GitHub auth, real Linux-filesystem clone setup, and full verification |
| Date tested | 2026-06-15 after Bob approved WSL auth |
| Command | `gh auth login --with-token` using a temporary Windows token handoff file; `gh auth setup-git`; `git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD`; `git clone https://github.com/slawdawg/Kendall-vnxt.git /root/src/Kendall_Nxt_real`; `git config core.hooksPath .githooks`; `pnpm run setup`; `pnpm run check` |
| Expected result | WSL can authenticate to the private repo, clone into the WSL filesystem, perform repo setup, and pass the full verification gate from the real clone. |
| Output summary | WSL `gh auth status` reports `slawdawg` authenticated under `/root/.config/gh/hosts.yml`; token details are intentionally not retained. Private `git ls-remote` resolved `origin HEAD` to `9f326b3dcd85100d0b269972819e8e6b40be00af`. The real clone at `/root/src/Kendall_Nxt_real` is on `main...origin/main`. After setting `core.hooksPath=.githooks`, workspace doctor prerequisites passed. `pnpm run setup` passed after fixing WSL `uv` PATH. Full `pnpm run check` passed in about 142s, including dashboard build and `205 passed, 1 warning` supervisor tests in 106.09s. |
| Error summary | The interactive `gh auth login --web` attempt timed out and left a stale `gh` process, which was stopped. Two initial token bridge attempts failed with `401 Bad credentials` because the token handoff path/encoding was wrong. PowerShell `<` redirection and a backslash-heavy `wslpath` call also failed before the successful forward-slash temp-file handoff. The real clone setup initially failed because non-interactive WSL commands could not find `uv`; adding `/usr/local/bin/uv -> /root/.local/bin/uv` fixed it. |
| Manual intervention required | Bob approval for WSL auth; no browser/device-code interaction was completed. |
| Workaround attempted | Yes: used a temporary UTF-8 token handoff file outside the repo, deleted it immediately, configured `gh` for Git, and added a WSL-local `uv` symlink for non-interactive commands. |
| Recovery required | Keep `docs/workflows/wsl-command-boundary.md` and `docs/workflows/wsl-github-credential-options.md` as setup guidance. If WSL auth expires, rerun an approved auth flow and verify `gh api user`/`git ls-remote` before delivery work. |
| Residue left behind | WSL auth state in `/root/.config/gh/hosts.yml`; WSL `gh` package; `/usr/local/bin/uv` symlink; real clone at `/root/src/Kendall_Nxt_real`; dependencies and `.venv` in that clone. No temp token file remained. |
| Evidence link or log path | Current session command output. |
| Severity | Medium |
| Failure type | AUTH |
| Decision impact | WSL2 is now viable for authenticated private-repo local development and full verification, but setup required multiple Windows-to-WSL handoff fixes and retained WSL credential state. |

### PE-027: WSL Codex Workspace Lifecycle Smoke Passes

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Codex workspace start/list/resume and cleanup using a temporary WSL state root |
| Date tested | 2026-06-15 after PE-026 |
| Command | `node ./scripts/codex-workspace.mjs start "wsl platform eval smoke" --mode experiment --no-fetch --task-id wsl-platform-eval-smoke --branch codex/wsl-platform-eval-smoke --worktree /tmp/kendall-wsl-eval-worktrees/wsl-platform-eval-smoke --state-root /tmp/kendall-wsl-eval-state`; `list --state-root /tmp/kendall-wsl-eval-state`; `resume "wsl platform eval smoke" --state-root /tmp/kendall-wsl-eval-state`; `git worktree remove ...`; `git branch -D ...`; remove `/tmp` state/worktree roots; verify `git status`, `git worktree list`, and temp paths absent |
| Expected result | WSL real clone can create, list, resume, and clean up a temporary Codex workspace without touching Windows workspace state. |
| Output summary | Start created task `wsl-platform-eval-smoke`, branch `codex/wsl-platform-eval-smoke`, worktree `/tmp/kendall-wsl-eval-worktrees/wsl-platform-eval-smoke`, and manifest `/tmp/kendall-wsl-eval-state/tasks/wsl-platform-eval-smoke.json`. List showed the task once as active. Resume printed the expected worktree path. Cleanup removed the worktree, deleted the branch at `9f326b3`, removed the temporary state/worktree roots, and left the real clone on clean `main...origin/main` with only its main worktree registered. |
| Error summary | None. |
| Manual intervention required | None. |
| Workaround attempted | Used an isolated `/tmp` state root instead of the default WSL state root so the evaluation smoke could clean its own artifacts without affecting durable task state. |
| Recovery required | None. |
| Residue left behind | No temporary workspace residue observed. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | WORKTREE |
| Decision impact | WSL2 passes the repo-owned Codex workspace lifecycle smoke from a real authenticated clone. |

### PE-028: WSL Auth And Toolchain Persist After Restart

| Field | Value |
| --- | --- |
| Platform | WSL2 |
| Check | Post-restart WSL real-clone, GitHub auth, private Git probe, and direct tool availability |
| Date tested | 2026-06-15 after key-added continuation |
| Command | `wsl.exe --list --verbose`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_real -- git status --short --branch`; `wsl.exe -d Ubuntu -- gh auth status`; `wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_real -- env GIT_TERMINAL_PROMPT=0 git ls-remote origin HEAD`; `node --version`; `pnpm --version`; `uv --version` inside WSL |
| Expected result | WSL remains usable after a stopped-state restart without repeating credential setup or PATH repair. |
| Output summary | WSL listed Ubuntu as stopped before launch. The real clone remained clean on `main...origin/main`. `gh auth status` remained authenticated as `slawdawg` with `gist`, `read:org`, `repo`, and `workflow` scopes. Private `git ls-remote origin HEAD` returned `9f326b3dcd85100d0b269972819e8e6b40be00af`. WSL direct tools resolved as Node `v22.22.1`, pnpm `11.5.2`, and uv `0.11.21`. |
| Error summary | None. |
| Manual intervention required | None. |
| Workaround attempted | No. |
| Recovery required | None. |
| Residue left behind | Existing WSL credential/tool state only; no new repo residue observed. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | AUTH |
| Decision impact | WSL2 credential and toolchain setup persisted across a stopped-state restart, reducing the risk that WSL is only viable inside one prepared session. |

### PE-029: Linux VM SSH Candidate Reachable But Login Blocked

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | SSH candidate reachability and public-key login readiness |
| Date tested | 2026-06-15 after key-added continuation |
| Command | `Get-ChildItem $env:USERPROFILE\.ssh`; `Get-Content $env:USERPROFILE\.ssh\known_hosts`; `ssh -i $env:USERPROFILE\.ssh\kendall_linux_vm_eval_ed25519 -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 <user>@192.168.1.6 "uname -a"` for `slaw_dawg`, `ubuntu`, `bob`, and `kendall` |
| Expected result | The dedicated eval key opens a non-interactive SSH session so Linux VM baseline checks can begin. |
| Output summary | The dedicated key pair exists as `kendall_linux_vm_eval_ed25519` and `kendall_linux_vm_eval_ed25519.pub`; the public key comment is `kendall-linux-vm-eval-2026-06-15`. `known_hosts` contains `192.168.1.6`, and SSH reaches the host. |
| Error summary | All tested accounts returned `Permission denied (publickey,password)`. No `uname` output was obtained, so OS, shell, repo path, toolchain, GitHub auth, and workspace checks could not start. |
| Manual intervention required | Yes: confirm the Linux VM username and that the eval public key is installed in that user's `~/.ssh/authorized_keys`, or provide the intended SSH target alias. |
| Workaround attempted | Tried only four likely usernames, then stopped to avoid blind account cycling. |
| Recovery required | After SSH login works, run the Linux VM baseline table from a native Linux filesystem clone and record PE-030 onward. |
| Residue left behind | None observed from read-only SSH probes. |
| Evidence link or log path | Current session command output. |
| Severity | High |
| Failure type | AUTH |
| Decision impact | Full Linux VM remains a plausible candidate, but it is still unscored because access is blocked at SSH public-key authentication. |

### PE-030: Linux VM SSH Login Works But Toolchain Setup Is Missing

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | SSH login, OS/shell identity, direct tool availability, repo path, and setup authority |
| Date tested | 2026-06-15 after Bob added the eval key to the VM |
| Command | `ssh -i %USERPROFILE%\.ssh\kendall_linux_vm_eval_ed25519 slaw_dawg@192.168.1.6 "uname -a"`; `cat /etc/os-release`; `pwd`; `printenv SHELL`; `node --version`; `git --version`; `gh --version`; `uv --version`; `pnpm --version`; `ls -la`; `sudo -n true`; `test -d /home/slaw_dawg/Kendall_Nxt` |
| Expected result | Linux VM accepts the eval key, reports baseline OS/toolchain facts, and is ready to run repo setup or clearly identifies missing prerequisites. |
| Output summary | SSH login now succeeds for `slaw_dawg@192.168.1.6`. The VM reports Ubuntu 26.04 LTS with kernel `7.0.0-22-generic`; the home directory is `/home/slaw_dawg`; the login shell is `/bin/bash`; Git is present as `2.53.0`. |
| Error summary | `node`, `pnpm`, `uv`, and `gh` are missing from PATH. No `/home/slaw_dawg/Kendall_Nxt` clone exists. `sudo -n true` fails with interactive authentication required, so system package installation cannot proceed from non-interactive SSH without Bob entering a sudo password or choosing a user-local setup path. |
| Manual intervention required | Yes: choose setup path and provide any needed sudo/auth interaction. |
| Workaround attempted | No installation workaround attempted during this evidence pass. |
| Recovery required | Either perform an interactive setup in the VM terminal, enable a bounded passwordless setup path temporarily, or approve user-local installation of Node/pnpm/uv/gh plus a repo clone under `/home/slaw_dawg`. |
| Residue left behind | None observed from read-only probes. |
| Evidence link or log path | Current session command output. |
| Severity | High |
| Failure type | PATH |
| Decision impact | Linux VM access is fixed, but the candidate cannot yet be compared to Windows or WSL2 for Kendall_Nxt daily workflow until the baseline toolchain and repo clone are installed. |

### PE-031: Linux VM Toolchain Setup And Full Check Pass

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Toolchain verification, GitHub auth, private repo access, native clone, setup, preflight, workspace doctor, and full project check |
| Date tested | 2026-06-15 after Bob completed the interactive package setup |
| Command | `node --version`; `pnpm --version`; `/home/slaw_dawg/.local/bin/uv --version`; `gh --version`; `gh auth status`; `env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD`; `git clone https://github.com/slawdawg/Kendall-vnxt.git /home/slaw_dawg/Kendall_Nxt`; `pnpm run setup`; `pnpm run preflight`; `git config core.hooksPath .githooks`; `node ./scripts/codex-workspace.mjs doctor`; `pnpm run check` |
| Expected result | Linux VM has the required Kendall_Nxt toolchain and can pass the same repo setup and full verification gate as Windows and WSL2. |
| Output summary | Node is `v24.16.0`. `pnpm --version` outside the repo resolved `11.7.0`, but inside `/home/slaw_dawg/Kendall_Nxt` Corepack used the repo-pinned `11.5.2`. `uv` is installed as `0.11.21` at `/home/slaw_dawg/.local/bin/uv`. `gh` is `2.94.0` and authenticated as `slawdawg` with `gist`, `read:org`, `repo`, and `workflow` scopes. Private Git probe returned `9f326b3dcd85100d0b269972819e8e6b40be00af`. Native clone is clean on `main...origin/main`. `pnpm run setup` passed, creating the supervisor virtualenv with CPython `3.12.13`. Explicit preflight passed. Workspace doctor passed after setting `core.hooksPath=.githooks`, with only the expected first-run state-root warning. Full `pnpm run check` passed in about 117s, including dashboard build and `205 passed, 1 warning` supervisor tests in 93.46s. |
| Error summary | Non-interactive SSH does not find `uv` unless `/home/slaw_dawg/.local/bin` is prepended to PATH. Fresh clone required the same local `core.hooksPath=.githooks` config as WSL. |
| Manual intervention required | Bob completed the package install and GitHub auth setup interactively before this pass. |
| Workaround attempted | Used `PATH=/home/slaw_dawg/.local/bin:$PATH` for repo commands that need `uv`. |
| Recovery required | Persist `/home/slaw_dawg/.local/bin` in the Linux user's non-interactive PATH or keep using the explicit PATH prefix in agent-run SSH commands. |
| Residue left behind | Native clone at `/home/slaw_dawg/Kendall_Nxt`, installed dependencies, supervisor `.venv`, GitHub CLI credential state, and local clone Git config. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | PATH |
| Decision impact | Linux VM now passes the core Kendall_Nxt setup and full verification gate with the fastest observed full-check time of the evaluated platforms. |

### PE-032: Linux VM Dashboard And Workspace Lifecycle Smoke Pass

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Playwright resolution, dashboard dev server readiness/cleanup, and temporary Codex workspace lifecycle |
| Date tested | 2026-06-15 after PE-031 |
| Command | `pnpm exec playwright --version`; `PORT=3100 timeout 15s pnpm --filter @kendall/dashboard dev`; `pgrep -af node`; `node ./scripts/codex-workspace.mjs start "linux vm platform eval smoke" --mode experiment --no-fetch --task-id linux-vm-platform-eval-smoke --branch codex/linux-vm-platform-eval-smoke --worktree /tmp/kendall-linux-vm-eval-worktrees/linux-vm-platform-eval-smoke --state-root /tmp/kendall-linux-vm-eval-state`; `list`; `resume`; `git worktree remove`; `git branch -D`; remove `/tmp` eval roots; verify clean status and temp paths absent |
| Expected result | Linux VM can run the dashboard dev server and repo-owned workspace lifecycle without stale process or worktree residue. |
| Output summary | Playwright reported `Version 1.60.0`. Dashboard dev server reached Ready on `http://localhost:3100` in 199ms and was stopped by timeout; `pgrep -af node` found no stale Node process afterward. Workspace start created task `linux-vm-platform-eval-smoke`, branch `codex/linux-vm-platform-eval-smoke`, worktree `/tmp/kendall-linux-vm-eval-worktrees/linux-vm-platform-eval-smoke`, and manifest `/tmp/kendall-linux-vm-eval-state/tasks/linux-vm-platform-eval-smoke.json`. List showed it once as active. Resume printed the expected worktree path. Cleanup removed the worktree, deleted the branch at `9f326b3`, removed temporary state/worktree roots, and left the clone clean on `main...origin/main`. |
| Error summary | Dashboard dev command exited non-zero only because `timeout` sent `SIGTERM` after readiness was observed. |
| Manual intervention required | None during the smoke. |
| Workaround attempted | Used isolated `/tmp` state and worktree roots to keep evaluation artifacts separate from durable workspace state. |
| Recovery required | None. |
| Residue left behind | No temporary workspace residue observed; native clone remains. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | WORKTREE |
| Decision impact | Linux VM passes dashboard readiness, process cleanup, and workspace lifecycle smoke in the first baseline pass. |

### PE-033: Linux VM Full Check Repeat Gate Passes

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Required repeated full verification runs |
| Date tested | 2026-06-15 after PE-031 |
| Command | `pnpm run check` repeated two additional times from `/home/slaw_dawg/Kendall_Nxt` with `PATH=/home/slaw_dawg/.local/bin:$PATH` |
| Expected result | Three total Linux VM full-check runs complete without PATH repair, auth prompt, stale process cleanup, or repo residue. |
| Output summary | Second full check passed in about 116s, including dashboard build and `205 passed, 1 warning` supervisor tests in 89.85s. Third full check passed in about 115s, including dashboard build and `205 passed, 1 warning` supervisor tests in 92.12s. Final `git status --short --branch` remained clean on `main...origin/main`, and `pgrep -af node` found no stale Node process. |
| Error summary | None. |
| Manual intervention required | None during repeated checks. |
| Workaround attempted | Continued using the explicit `/home/slaw_dawg/.local/bin` PATH prefix for non-interactive SSH commands. |
| Recovery required | None for repeated full checks. Persisting PATH remains recommended before daily use. |
| Residue left behind | None observed beyond the intended Linux VM clone/dependencies. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | PERFORMANCE |
| Decision impact | Linux VM now satisfies the three-run full verification requirement and remains faster than the Windows and WSL2 full-check baselines. |

### PE-034: Linux VM Startup Session Checks Pass With PATH Follow-Up

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Startup/session visibility, systemd health, process residue, and non-interactive PATH behavior |
| Date tested | 2026-06-15 after PE-033 |
| Command | `printenv PATH`; `uptime -s`; `systemctl is-system-running`; `systemctl --user is-system-running`; `who -b`; `last reboot -n 1`; `loginctl show-user slaw_dawg -p State -p Linger -p Sessions -p RuntimePath`; `loginctl list-sessions --no-legend`; exact process probes with `pgrep -x node`, `pgrep -x pnpm`, and `pgrep -x python` |
| Expected result | VM startup/session state is inspectable, core service managers are healthy, no stale repo processes remain, and non-interactive SSH can resolve required tools without per-command repair. |
| Output summary | Non-interactive SSH PATH is `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin`. `uptime -s` reported `2026-06-15 20:58:50`. System systemd and user systemd both reported `running`. `loginctl show-user` reported `RuntimePath=/run/user/1000`, `State=active`, `Linger=no`, and active sessions. Exact process probes found no `node`, `pnpm`, or `python` processes after verification. |
| Error summary | Plain `uv --version` still fails in non-interactive SSH because `/home/slaw_dawg/.local/bin` is not on PATH. `who -b` returned no boot record, and `last` is not installed. A combined `pgrep -af "node|pnpm|next|pytest|uvicorn|python"` probe lost quoting across the PowerShell-to-SSH boundary and was replaced with exact process-name probes. |
| Manual intervention required | Yes: persist the uv path or install a system-visible uv wrapper. |
| Workaround attempted | Continued using `PATH=/home/slaw_dawg/.local/bin:$PATH` for repo commands. |
| Recovery required | Preferred fix: create system-visible symlinks with `sudo ln -sf /home/slaw_dawg/.local/bin/uv /usr/local/bin/uv` and, if present, `sudo ln -sf /home/slaw_dawg/.local/bin/uvx /usr/local/bin/uvx`; then verify plain `uv --version` over SSH. |
| Residue left behind | None from read-only checks. |
| Evidence link or log path | Current session command output. |
| Severity | Medium |
| Failure type | PATH |
| Decision impact | Startup/session inspection is acceptable and no stale process residue was found, but non-interactive PATH persistence remains the last cutover blocker. |

### PE-035: Linux VM Non-Interactive uv PATH Fixed

| Field | Value |
| --- | --- |
| Platform | Full Linux VM |
| Check | Plain non-interactive `uv` resolution and repo preflight without PATH prefix |
| Date tested | 2026-06-15 after Bob created system-visible uv symlinks |
| Command | `uv --version`; `cd /home/slaw_dawg/Kendall_Nxt && pnpm run preflight` over non-interactive SSH without a PATH override |
| Expected result | The repo can resolve `uv` and pass preflight from the default SSH command environment. |
| Output summary | Plain `uv --version` returned `uv 0.11.21 (x86_64-unknown-linux-gnu)`. `pnpm run preflight` passed without adding `/home/slaw_dawg/.local/bin` to PATH. |
| Error summary | None. |
| Manual intervention required | Bob created system-visible `uv`/`uvx` symlinks before this verification. |
| Workaround attempted | No PATH prefix was used for this verification. |
| Recovery required | None. If uv is reinstalled elsewhere, refresh the symlink or install uv system-wide. |
| Residue left behind | Intended symlink(s) under `/usr/local/bin`; native clone/dependencies remain. |
| Evidence link or log path | Current session command output. |
| Severity | Low |
| Failure type | PATH |
| Decision impact | The last Linux VM cutover blocker is cleared; Linux VM is ready for a primary-platform decision. |

#### WSL2 Retry Gate After VMware Settings Change

Do not retry Ubuntu registration until a fresh Windows boot has runtime evidence
that VMware loaded nested virtualization for the guest.

Earlier checks used the WMI CPU fields below as the gate. After PE-014, those
fields still report `False`, but the fresh VMware log shows `vhv.enable =
"TRUE"`, guest VT-x/EPT capability, and Windows starting as a Hyper-V management
OS. Treat the WMI fields as useful diagnostic data, not the sole retry gate.

If Bob changed VMware settings and there is no fresh runtime log proving
`vhv.enable` was loaded, inspect VMware's effective runtime/config for this VM
first. A Windows-side WSL retry can repeat the same
`HCS_E_HYPERV_NOT_INSTALLED` failure until the virtual CPU exposes nested
virtualization.

Diagnostic fields to capture before retry:

- `VirtualizationFirmwareEnabled=True`
- `SecondLevelAddressTranslationExtensions=True`
- `VMMonitorModeExtensions=True`

Retry commands:

```powershell
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
[pscustomobject]@{
  Manufacturer = $cs.Manufacturer
  Model = $cs.Model
  HypervisorPresent = $cs.HypervisorPresent
  VirtualizationFirmwareEnabled = $cpu.VirtualizationFirmwareEnabled
  SecondLevelAddressTranslationExtensions = $cpu.SecondLevelAddressTranslationExtensions
  VMMonitorModeExtensions = $cpu.VMMonitorModeExtensions
}
wsl.exe --status
wsl.exe --list --verbose
wsl.exe --install -d Ubuntu --no-launch
wsl.exe --list --verbose
```

If Ubuntu registers, initialize it, create the Linux user, clone
`Kendall_Nxt` inside the WSL filesystem, and start the WSL2 baseline checks
from the table above.

## Pain Point Probes

### Shell Quoting

Goal: verify whether common repo commands survive realistic quoting, variables,
paths with spaces, and script arguments.

Evidence to collect:

- Exact command
- Whether quoting required platform-specific changes
- Whether the failure was obvious or misleading

### Sandbox / Command Serialization

Goal: determine whether agent-run commands can execute predictably without
runner timeouts or serialized-only behavior.

Evidence to collect:

- Timeout frequency
- Whether retry changed the result
- Whether the failure happened before process output

### PATH Sensitivity

Goal: verify whether Node, pnpm, uv, Python, Git, and gh resolve consistently
across fresh shells and agent sessions.

Evidence to collect:

- Fresh shell results
- Agent session results
- Any dependency on user PATH, machine PATH, profile scripts, or manual exports

### Credential and Auth Behavior

Goal: verify GitHub CLI, Git credential storage, and secret handling without
tying the workflow to fragile desktop state.

Evidence to collect:

- `gh auth status`
- Git fetch/push readiness if approved
- Credential manager used
- Any dependence on DPAPI, GCM, browser login, or desktop session

### Startup and Long-Running Processes

Goal: verify whether dashboard, supervisor, and Codex-related processes can
start, stop, and recover cleanly.

Evidence to collect:

- Startup method
- Stop method
- Logs
- Stale process behavior
- Recovery steps

### Worktree Lifecycle

Goal: verify repo-owned Codex workspace scripts can start, list, resume, finish,
and clean up without residue.

Evidence to collect:

- Manifest state
- Worktree path
- Cleanup dry-run output
- Residue after cleanup

## Stop / Go Gates

### Stay On Windows 11 Only If

- Sandbox/command serialization rules are tolerable and documented.
- PATH/tool resolution is stable after restart.
- GitHub auth and GCM behavior are predictable.
- Worktree cleanup residue is rare and recoverable.
- Playwright/dashboard workflows are reliable.
- Bob accepts Windows-specific runbook overhead.

### Move Primary Dev To WSL2 Only If

- Repo lives inside the WSL filesystem, not `/mnt/c`.
- Node, pnpm, uv, Python, Playwright, Git, and gh all pass cleanly.
- Browser/dashboard workflow is usable without awkward host boundary failures.
- GitHub auth is stable across sessions.
- File watchers and test performance beat or match Windows.
- Windows interop does not become a new hidden failure class.

### Move Primary Dev To Full Linux VM Only If

- It materially reduces quoting, PATH, process, and cleanup failures.
- Browser/dev server workflows are smooth enough for daily use.
- GitHub auth and SSH are clean and recoverable.
- Performance is acceptable.
- VM startup, snapshots, backups, and file sharing are operationally simple.
- Added VM management cost is lower than current Windows friction.

### Hard Stop Gates

Stop the sprint early for a platform if any of these occur repeatedly:

- Cannot run core verification without manual repair.
- Auth breaks or becomes unsafe to recover.
- Worktree lifecycle leaves ambiguous or risky repo state.
- Dev server/browser workflow cannot be made reliable.
- Recovery from stale process or interrupted run is unclear.
- Platform requires undocumented human memory to operate safely.

## Scorecard

| Category | Windows 11 | WSL2 | Linux VM | Evidence IDs |
| --- | ---: | ---: | ---: | --- |
| Command reliability | 2 | 3 | 3 | PE-001, PE-002, PE-016, PE-019, PE-023, PE-026, PE-028, PE-006, PE-029, PE-030, PE-031 |
| Shell/script predictability | 1 | 1 | 2 | PE-002, PE-016, PE-017, PE-019, PE-021, PE-030, PE-031 |
| Node/pnpm workflow | 3 | 3 | 3 | PE-001, PE-002, PE-016, PE-023, PE-030, PE-031 |
| uv/Python supervisor workflow | 2 | 2 | 2 | PE-001, PE-002, PE-016, PE-026, PE-030, PE-031 |
| Playwright/dashboard workflow | 2 | 3 | 3 | PE-002, PE-016, PE-023, PE-031, PE-032 |
| Git/GitHub auth | 3 | 2 | 3 | PE-003, PE-017, PE-018, PE-022, PE-024, PE-026, PE-028, PE-029, PE-030, PE-031 |
| Codex workspace lifecycle | 3 | 3 | 3 | PE-018, PE-019, PE-025, PE-027, PE-031, PE-032 |
| Startup/session behavior | 2 | 2 | 2 | PE-004, PE-007, PE-015, PE-020, PE-029, PE-030 |
| Cleanup/recovery | 2 | 3 | 3 | PE-004, PE-018, PE-019, PE-020, PE-023, PE-027, PE-032 |
| Agent operability | 2 | 2 | 3 | PE-001, PE-002, PE-016, PE-019, PE-021, PE-026, PE-028, PE-029, PE-030, PE-031, PE-032 |
| Secret handling | 2 | 2 | 2 | PE-003, PE-017, PE-018, PE-022, PE-024, PE-026, PE-028, PE-029, PE-030, PE-031 |
| Total | 24 | 26 | 29 | Linux VM meets the 20% improvement threshold over Windows, passed the three-run full-check gate, and cleared non-interactive `uv` PATH verification. |

## Decision Rules

| Result | Recommendation |
| --- | --- |
| Windows passes all critical rows with no reruns | Stay on Windows 11 and fix remaining workflow docs |
| Windows fails quoting/sandbox/PATH rows but WSL2 passes | Move primary dev to WSL2, keep Windows as host only |
| WSL2 fails watcher/auth/process isolation but Linux VM passes | Move primary dev to Linux VM |
| Linux VM has the fewest failures but setup cost is high | Use Linux VM for Codex/dev automation and keep Windows for desktop apps |
| No environment passes | Stop migration decision and fix repo bootstrap/tooling first |

## Decision Summary

### Recommended Primary Platform

- [ ] Windows 11 native for current Kendall_Nxt work
- [ ] WSL2
- [x] Full Linux VM
- [ ] No decision yet; more evidence required

### Rationale

- Windows passes the core repo checks and private Git remote probe from the actual Git worktree, including full `pnpm.cmd run check`, GitHub CLI auth, `git ls-remote origin HEAD`, and workspace doctor (`PE-002`, `PE-003`, `PE-018`).
- WSL2 is now technically available after VMware runtime reload and Ubuntu registration, so the original WSL startup blocker is cleared (`PE-014`, `PE-015`).
- WSL2 local build/test performance is promising: full check passed and supervisor tests completed much faster than the Windows baseline in the copied Linux filesystem tree (`PE-016`).
- WSL2 local runtime evaluation is complete enough to score: dependency health, Playwright readiness, dashboard dev server startup, and process cleanup passed from the Linux filesystem eval tree (`PE-023`).
- WSL2 private GitHub auth, real Linux-filesystem clone, setup, and full `pnpm run check` now pass after approved credential setup and a WSL-local `uv` PATH fix (`PE-026`).
- WSL2 Codex workspace lifecycle now passes for start/list/resume/cleanup using an isolated temporary state root from the real clone (`PE-027`).
- WSL2 auth and direct tool availability persisted after a stopped-state restart; `gh auth status`, private `git ls-remote`, Node, pnpm, and uv all still passed from the real clone (`PE-028`).
- WSL2 has a Windows-hosted agent quoting hazard: complex inline POSIX/Node commands lost quoting across the PowerShell-to-WSL boundary and required Tool Churn RCA rather than more retries (`PE-021`).
- WSL2 scores higher than Windows in this packet, but not by the required 20% migration threshold; `26` vs `24` is an 8.3% improvement.
- Windows had a serious Git process-residue event, but follow-up showed the Git residue cleared without manual cleanup; it remains a monitoring/runbook concern rather than a standalone migration trigger (`PE-004`, `PE-020`).
- Full Linux VM now accepts the dedicated eval key for `slaw_dawg@192.168.1.6`, has the required toolchain and native clone, passes setup, preflight, full `pnpm run check`, dashboard dev-server smoke, and temporary Codex workspace lifecycle (`PE-029`, `PE-030`, `PE-031`, `PE-032`).
- Full Linux VM score is `29` vs Windows `24`, which meets the 20% improvement threshold by a narrow margin. It has also passed the required three full `pnpm run check` runs with no stale Node process or repo residue (`PE-033`).
- The final Linux VM operational blocker was cleared: plain non-interactive `uv --version` and `pnpm run preflight` now pass without a PATH override (`PE-035`).

### Tradeoffs Accepted

- Windows keeps PowerShell quoting, sandbox serialization, and process-observability overhead in the daily workflow.
- WSL2 remains a near-term pilot candidate, not the primary platform, because its measured improvement over Windows is modest and the Windows-to-WSL command boundary still adds agent-operability friction.
- Linux VM is selected as the recommended primary development platform for Kendall_Nxt. The current operator host remains only for SSH/private-key access during transition, not as a planned development fallback.

### Required Follow-Up Work

- For Windows: preserve historical baseline evidence only; do not add new Windows-first workflow work unless Linux recovery requires it.
- For WSL2: decide whether the modest score improvement justifies migrating despite the 20% threshold not being met, Windows-hosted command-boundary quoting friction, and retained WSL credential state.
- For WSL2: use `docs/workflows/wsl-command-boundary.md` for cross-boundary command probes so agents do not handcraft nested PowerShell-to-Bash quoting for routine diagnostics.
- For Linux VM: use `docs/workflows/linux-primary-development-runbook.md` as the draft cutover runbook; confirm snapshot/backup policy and complete one normal development task from Linux before declaring Linux the active development baseline.

### Stop Conditions

- Reopen if Windows repeats stale Git/process residue during normal work and requires manual cleanup.
- Reopen if WSL2 proves private GitHub auth, real clone, workspace lifecycle, dashboard dev server, and file watchers with lower friction than Windows.
- Reopen if a full Linux VM completes the baseline with materially better auth, process cleanup, and agent operability than Windows.

## Migration Plan Stub

If the selected platform is WSL2 or Linux VM, create a follow-up implementation
plan covering:

- Repo location and clone strategy
- Secrets and credential migration
- GitHub CLI authentication
- pnpm store and Node setup
- uv/Python environment setup
- Playwright browser dependencies
- Dashboard and supervisor startup
- Codex workspace state location
- Cleanup of Windows-specific assumptions
- Documentation updates
