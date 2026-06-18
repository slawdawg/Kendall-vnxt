# Mise Managed Worktree Readiness Evidence

Date: 2026-06-18
Status: complete evaluation; superseded by tracked mise workflow implementation
Story: `docs/stories/22-2-evaluate-mise-managed-worktree-readiness.md`
Workflow: `docs/workflows/mise-managed-worktree-readiness-evaluation.md`

## Summary

The current managed worktree baseline is ready using the existing Kendall_Nxt
tooling path. The controlled `mise` trial proved that `mise` can install and
activate the pinned tool versions in a scoped `/tmp` location. The original
trial failed under mise-managed pnpm because repo scripts mishandled pnpm
wrapper/shim command resolution.

Historical decision:

```text
defer tracked mise adoption until the repo's pnpm/npm_execpath compatibility
issue is resolved and a clean post-merge trial passes.
```

Follow-up retry:

```text
after local command-resolution hardening on branch research/brainstorming,
the scoped mise retry passed setup, preflight, and workspace doctor. This
resolves the observed setup/preflight blocker locally, but tracked mise adoption
should still wait until the fix is merged to main and rerun from a clean merged
baseline.
```

Implementation follow-up:

```text
Story 22.3 implemented tracked `mise.toml` after PR #146 merged the pnpm shim
hardening to main and a clean post-merge mise trial passed without
`--skip-tools`.
```

## Baseline Evidence

This section is baseline readiness evidence, not `mise`-managed readiness
evidence.

The timing values are environment-specific observations from this worktree on
2026-06-18. They are not stable performance benchmarks. The setup timing was
captured after pnpm dependencies were already present and after uv cache access
was approved for the rerun.

The first approval event was sandbox escalation for the baseline setup measurement
because uv needed to create temporary files under
`/home/slaw_dawg/.cache/uv`, outside the writable workspace sandbox. It did not
approve `mise`, provider calls, secrets, PR/merge/cleanup, branch deletion, or
worktree removal.

The second approval event covered controlled `mise` install/use for this trial.
The install was scoped to `/tmp/kendall-mise-trial` by setting:

- `MISE_INSTALL_PATH=/tmp/kendall-mise-trial/bin/mise`
- `MISE_DATA_DIR=/tmp/kendall-mise-trial/data`
- `MISE_CACHE_DIR=/tmp/kendall-mise-trial/cache`
- `MISE_STATE_DIR=/tmp/kendall-mise-trial/state`
- `MISE_CONFIG_DIR=/tmp/kendall-mise-trial/config`

## Evidence Packet

```text
baseline_commands:
  - node --version
  - pnpm --version
  - uv --version
  - python3 --version
  - node ./scripts/codex-workspace.mjs doctor
  - /usr/bin/time -f 'elapsed=%E exit=%x' pnpm run setup
  - /usr/bin/time -f 'elapsed=%E exit=%x' pnpm run preflight

baseline_command_count:
  - 7

baseline_elapsed:
  - setup: 0:01.34 after approved uv cache access
  - preflight: 0:00.77

baseline_prompts_or_manual_steps:
  - first setup attempt failed in sandbox because uv could not create a
    temporary file under /home/slaw_dawg/.cache/uv
  - approved rerun allowed uv cache access and setup passed

baseline_result:
  - setup passed
  - preflight passed
  - codex-workspace doctor passed

mise_available:
  - yes, after controlled install to /tmp/kendall-mise-trial/bin/mise

mise_missing_stop_reason:
  - initial command -v mise returned not found
  - resumed after Bob unblocked the controlled mise trial

mise_commands:
  - command -v mise
  - curl -fsSL https://mise.run -o /tmp/kendall-mise-trial/install.sh
  - MISE_QUIET=1 MISE_INSTALL_PATH=/tmp/kendall-mise-trial/bin/mise sh /tmp/kendall-mise-trial/install.sh
  - mise --version
  - mise install
  - mise exec -- node --version
  - mise exec -- pnpm --version
  - mise exec -- python --version
  - mise run setup
  - mise run preflight
  - mise run workspace-doctor

mise_elapsed:
  - install tools: 0:05.73
  - run setup: 0:10.79 failed before HOME scoping; 0:10.74 failed with TMPDIR only; 0:10.74 failed from temp HOME; 0:10.40 failed with explicit worktree cd
  - run preflight: 0:10.41 failed
  - run workspace-doctor: 0:10.42 passed

mise_prompts_or_manual_steps:
  - install script downloaded from official https://mise.run endpoint
  - install path, data, cache, state, config, and HOME were scoped to /tmp
  - temp config was written under /tmp/kendall-mise-trial/config/config.toml
  - no shell activation or shell profile edits were performed

active_versions:
  - host node: v22.22.1
  - repo node pin: 22.13.0
  - pnpm: 11.5.2
  - uv: 0.11.21
  - host python3: 3.14.4
  - supervisor setup python: CPython 3.12.13 selected by uv
  - note: host python3 is not the supervisor runtime selected by uv
  - mise node: v22.13.0
  - mise pnpm: 11.5.2
  - mise python: Python 3.12.13

setup_result:
  - baseline: pass after approved uv cache access
  - mise original trial: fail
  - original failure reason: repo setup runs under `pnpm run setup`; mise-managed pnpm
    exposes `npm_execpath` in a way that makes `scripts/setup.mjs` resolve
    pnpm through `node ./pnpm`, producing `Cannot find module .../pnpm`
  - mise follow-up retry after local pnpm shim hardening: pass with
    `mise run --skip-tools setup` in the existing scoped/offline mise install

preflight_result:
  - baseline: pass
  - mise original trial: fail
  - original failure reason: `pnpm run preflight` under mise-managed pnpm fails
    the repo preflight pnpm availability check
  - mise follow-up retry after local pnpm shim hardening: pass with
    `mise run --skip-tools preflight` in the existing scoped/offline mise
    install

workspace_doctor_result:
  - baseline: pass
  - mise original trial: pass with Node v22.13.0
  - mise follow-up retry after local pnpm shim hardening: pass with
    `mise run --skip-tools workspace-doctor`
  - note: mise-scoped HOME changes the local codex state root observation,
    causing doctor to warn that the state root does not exist yet

changed_files:
  - tracked/untracked docs only
  - node_modules/ ignored
  - services/supervisor/.venv/ ignored

ignored_state_changes:
  - node_modules/ exists as ignored dependency state
  - services/supervisor/.venv/ exists as ignored uv-managed environment state
  - /tmp/kendall-mise-trial contains mise binary, installer, config, data,
    cache, state, scoped home, and installed tools
  - /tmp/kendall-mise-trial size: 555M

secrets_loaded_by_default:
  - no dotenv files copied
  - no provider/API secret values printed or inspected
  - temporary mise config contained no `[env]`, hooks, or dotenv directives

secret_inheritance_check:
  - checked environment variable names only, without printing values
  - only matching name observed: GH_PAGER
  - no provider/API secret values printed or inspected

friction_delta:
  - baseline setup friction is low once uv cache access is available
  - mise adds a one-time 555M scoped tool/cache footprint in this trial
  - mise fixes Node drift for direct `mise exec` and workspace doctor
  - original mise-managed `pnpm run setup` and `pnpm run preflight` failed
    against the then-current repo scripts
  - follow-up retry passed after local pnpm shim hardening, but used
    `--skip-tools` against the existing scoped/offline install
  - Story 22.3 later validated the same workflow from merged `main` without
    `--skip-tools`

recommendation:
  - historical recommendation was to defer tracked mise config adoption
  - current recommendation is recorded in Story 22.3 and
    `docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md`

remaining_gaps:
  - historical gaps were closed by Story 22.3 for the minimal tracked workflow
  - future expansion beyond tool pins and package-script task aliases needs
    separate approval and evidence
```

## Follow-Up Retry Evidence After Local Hardening

This retry was run from branch `research/brainstorming` after the local commit
`b9e12c9 Harden workspace command resolution for pnpm shims`. It is follow-up
evidence for the earlier blocker, not a tracked `mise` adoption decision.

Scoped environment:

```text
MISE_OFFLINE=1
MISE_NO_UPDATE_NOTIFIER=1
MISE_INSTALL_PATH=/tmp/kendall-mise-trial/bin/mise
MISE_DATA_DIR=/tmp/kendall-mise-trial/data
MISE_CACHE_DIR=/tmp/kendall-mise-trial/cache
MISE_STATE_DIR=/tmp/kendall-mise-trial/state
MISE_CONFIG_DIR=/tmp/kendall-mise-trial/config
HOME=/tmp/kendall-mise-trial/home
```

Retry results:

```text
mise version: 2026.6.11 linux-x64 (2026-06-16)
mise exec -- node --version: v22.13.0
mise exec -- pnpm --version: 11.5.2
mise exec -- python --version: Python 3.12.13
mise run --skip-tools preflight: pass
mise run --skip-tools setup: pass
mise run --skip-tools workspace-doctor: pass with expected scoped-HOME state-root warning
```

The workspace-doctor retry reported:

```text
OK: git: git version 2.53.0
OK: node: v22.13.0
OK: gh: gh version 2.46.0 (2025-12-13 Ubuntu 2.46.0-4)
OK: Repository worktree detected.
OK: origin remote configured.
OK: core.hooksPath is .githooks.
OK: pre-push guard exists.
WARN: state root does not exist yet; it will be created by the first `start` command.
```

Updated interpretation:

- The original `mise` blocker is no longer reproduced after the local pnpm shim
  hardening.
- PR #146 merged the hardening to `main` as
  `c08e563 Harden research workflow readiness`.
- Story 22.3 later proved the same path from merged `main` and implemented the
  minimal tracked `mise.toml` workflow.
- No provider/API secrets, dotenv files, PR delivery, branch cleanup, worktree
  cleanup, worker launch, provider call, or paid call was performed during this
  retry.

## Acceptance Criteria Mapping

| AC | Evidence |
| --- | --- |
| AC1 baseline setup workflow evidence | Satisfied: setup/preflight commands, elapsed time, manual approval for uv cache, and pass results recorded. |
| AC2 mise trial evidence | Satisfied: controlled install, setup, preflight, and workspace-doctor results recorded; original setup/preflight failed under mise-managed pnpm, then local scoped/offline `--skip-tools` retry passed after pnpm shim hardening. |
| AC3 mise unavailable stop line | Satisfied: initial missing state recorded; resumed only after Bob unblocked controlled install/use. |
| AC4 version source of truth | Satisfied: mise activated Node `22.13.0`, pnpm `11.5.2`, and Python `3.12.13`; baseline host drift recorded. |
| AC5 task delegation | Satisfied: temp mise tasks delegated to existing `pnpm run setup`, `pnpm run preflight`, and `pnpm run codex:workspace:doctor`. |
| AC6 secret boundary | Satisfied for trial evidence: no dotenv copy; env-name check printed no secret values and found only `GH_PAGER`. |
| AC7 adoption decision | Satisfied historically: measured trial and follow-up retry supported deferring tracked mise adoption until pnpm shim hardening was merged and a clean post-merge trial passed from `main`; Story 22.3 records the later adoption decision. |
| AC8 stop lines | Satisfied: no global install, no provider calls, no paid calls, no worker launch, no GitHub mutation, no cleanup, no branch deletion, no worktree removal. |

## Party Mode Notes

Party-mode architecture, development, and test perspectives agreed:

- Treat `mise` as optional readiness evidence during Story 22.2, not a mandatory
  rollout from that evaluation story.
- Record the Node version drift as a non-blocking readiness risk.
- Complete the baseline readiness evidence.
- Defer tracked `mise` adoption from Story 22.2 until the local repo script
  compatibility fix is merged and validated from `main`; Story 22.3 later
  completed that follow-up.
- Do not mutate global tooling, shell profiles, Node versions, package-manager
  installs, credentials, worktrees, branches, or remotes in this story run.

## Sources

- mise getting started and install behavior: https://mise.jdx.dev/getting-started.html
- mise install methods and `MISE_INSTALL_PATH`: https://mise.jdx.dev/installing-mise.html
- mise config file precedence and `mise.local.toml`: https://mise.jdx.dev/configuration.html

## Next Follow-Up Gate

Tracked `mise` adoption is implemented by:

- `docs/stories/22-3-implement-mise-normal-workflow.md`
- `docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md`

Future work should only expand beyond this minimal workflow with separate
approval and evidence.
