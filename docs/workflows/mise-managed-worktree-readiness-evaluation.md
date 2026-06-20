# Mise Managed Worktree Readiness Evaluation

Date: 2026-06-18
Status: proposed workflow

## Purpose

Evaluate whether `mise` should become Kendall_Nxt's standard local worktree
readiness layer for tools, non-secret environment defaults, and common task
aliases.

This workflow exists to reduce repeated operator worktree setup friction while
honoring the principle: mature tools and standard practices first, custom
Kendall_Nxt code last.

## Inputs

The original research packets for the worktree-environment comparison were
local-only planning artifacts and are not part of the GitHub clean-install
surface. Their preserved copies, when needed for local audit, live under
`_bmad-output/local-clean-install-boundary-removed-artifacts/` and are ignored
by Git. This evaluation no longer depends on those packets as tracked inputs;
use the source-owned inputs below for current evaluation and verification:

- `AGENTS.md`
- `.node-version`
- `package.json`
- `services/supervisor/pyproject.toml`
- `runtime/pyproject.toml`

## Standard Tooling Decision

Use the repo-owned Codex workspace lifecycle for governed work:

```text
node ./scripts/codex-workspace.mjs start "<task>"
node ./scripts/codex-workspace.mjs list
node ./scripts/codex-workspace.mjs resume "<task>"
node ./scripts/codex-workspace.mjs doctor
```

Use `mise` only as the candidate worktree readiness layer. It must not replace
Git worktrees, `scripts/codex-workspace.mjs`, package scripts, uv, pnpm, or
existing authority gates.

## Trial Boundaries

This workflow has two distinct phases:

1. **Baseline readiness evidence**, which uses the existing Kendall_Nxt setup,
   preflight, and workspace-doctor commands.
2. **`mise`-managed readiness evidence**, which is not complete until `mise`
   is available and approved for controlled use.

Do not describe the second phase as validated from baseline evidence alone.

## Trial Config Shape

The first implementation story should create an example or proposal config,
not a mandatory rollout:

```toml
[tools]
node = "22.13.0"
pnpm = "11.5.2"
python = "3.12"

[tasks.setup]
run = "pnpm run setup"

[tasks.preflight]
run = "pnpm run preflight"

[tasks.workspace-doctor]
run = "pnpm run codex:workspace:doctor"
```

Version pins must come from existing repo sources of truth:

- `.node-version` pins Node `22.13.0`.
- `package.json` declares `pnpm@11.5.2`.
- `services/supervisor/pyproject.toml` requires Python `>=3.12`.
- `runtime/pyproject.toml` requires Python `>=3.11`.

Python `3.12` is the first shared default because it satisfies both Python
package constraints.

If the host already satisfies a requirement, still record whether `mise` adds
value:

- Node: classify host/runtime drift from `.node-version` as acceptable,
  blocking, or remediated by `mise`.
- pnpm: explain whether `mise` improves consistency beyond the existing
  `packageManager` pin.
- Python: distinguish host `python3` from the Python selected by uv or `mise`.

## Evaluation Procedure

1. Start or select one managed experiment worktree.
2. Record the current baseline setup path:
   - commands run;
   - elapsed setup time;
   - prompts or manual steps;
   - missing host prerequisites;
   - whether `pnpm run setup` and `pnpm run preflight` pass.
3. Check whether `mise` is already available.
   - If `mise` is available, continue the trial.
   - If `mise` is not available, record `mise_missing` as a host prerequisite
     and stop before installing global tooling unless the operator explicitly approves a
     separate install operation.
   - If `mise` is available but the requested tool versions are not installed,
     stop before running `mise install` unless the approval also covers
     user-level/project-level tool downloads and cache mutation.
4. Add the non-secret `mise` proposal/config in the experiment scope.
5. Run:
   - `mise install`;
   - `mise run setup`;
   - `mise run preflight`;
   - `mise run workspace-doctor`.
6. Record the `mise` workflow evidence:
   - commands run;
   - elapsed setup time;
   - prompts or manual steps;
   - active Node, pnpm, and Python versions;
   - setup/preflight/doctor result;
   - whether any unrelated files changed.
7. Compare baseline versus `mise` using the decision criteria below.

## Approval Shape

The `mise` install/use approval must name:

- operation: install/use `mise` for Story 22.2 readiness evaluation;
- scope: this managed worktree only;
- allowed mutations: explicit user-level or project-level tool/cache writes, if
  `mise install` must download toolchains;
- denied data: provider/API secrets, `.env` files, raw credentials, sessions,
  account material;
- denied operations: PR/merge/cleanup, branch deletion, worktree removal,
  provider calls, paid calls, worker/process launches, remote mutation;
- evidence: command metadata, version checks, setup/preflight/doctor results,
  changed files, ignored-state summary, remaining gaps.

Local-only or project-scoped `mise` execution is still blocked if it performs
tool downloads, cache writes, shell-profile changes, secret loading, or other
state changes outside the approved scope.

## Decision Criteria

Adopt a tracked `mise` config only if the trial proves:

- it reduces command memory or setup steps;
- it activates the repo-declared Node, pnpm, and Python versions correctly;
- it delegates to existing package scripts instead of replacing them;
- it does not load provider/API secrets by default;
- it does not create a competing lifecycle model;
- it works inside a fresh managed worktree;
- it avoids unrelated file churn;
- it makes version drift easier to detect or correct than the current baseline;
- it reduces repeated worktree entry friction enough to justify adding another
  tool dependency;
- it records ignored local-state churn such as `node_modules/`,
  `services/supervisor/.venv/`, `~/.local/share/mise`, or other tool caches.

Defer adoption if:

- host prerequisite setup is more painful than the current workflow;
- `mise` cannot satisfy the repo's version requirements cleanly;
- the workflow hides commands that should remain explicit;
- the setup requires secrets or broad session env loading;
- the benefit is only cosmetic.

## Evidence Packet

The implementation story should leave a short evidence packet with:

```text
baseline_commands:
baseline_command_count:
baseline_elapsed:
baseline_prompts_or_manual_steps:
baseline_result:
mise_available:
mise_missing_stop_reason:
mise_commands:
mise_elapsed:
mise_prompts_or_manual_steps:
active_versions:
setup_result:
preflight_result:
workspace_doctor_result:
changed_files:
ignored_state_changes:
secrets_loaded_by_default: no
secret_inheritance_check:
friction_delta:
recommendation:
remaining_gaps:
```

## Stop Lines

- Do not make `mise` mandatory in the first story.
- Do not install tools globally unless the operator explicitly approves that operation.
- Do not load provider/API secrets.
- Do not copy `.env` files into worktrees.
- Do not replace `scripts/codex-workspace.mjs`.
- Do not add a custom readiness checker unless the trial proves a specific
  uncovered Kendall_Nxt governance or evidence gap.
- Do not add Nix, Devbox, or Dev Containers in the first `mise` trial.
- Do not run `mise install` or any command that downloads toolchains or mutates
  user-level/project-level tool caches unless the approval explicitly covers
  those writes.
- Do not rely on passive observation for secret safety. Check and record whether
  the command environment contains obvious provider/API secret variable names,
  without printing values.
- Do not perform provider calls, paid calls, process launches, worker launches,
  PR delivery, merge, cleanup, branch deletion, worktree removal, or remote
  mutation from this workflow.

## Continuation After Approval

When the operator approves the `mise` install/use gate:

1. Reconfirm worktree path, branch, and current changed files.
2. Reconfirm the exact approval scope and denied operations.
3. Check whether `mise` exists on PATH.
4. If install is required, use only the approved install path and record the
   command, target, and cache/tool directories touched.
5. Add the non-secret candidate config in the approved experiment scope.
6. Before running `mise install`, record the expected tool/cache mutation.
7. Run `mise install`, `mise run setup`, `mise run preflight`, and
   `mise run workspace-doctor`.
8. Record active versions, elapsed time, command count, prompts/manual steps,
   tracked changes, ignored-state changes, and secret-inheritance check.
9. Update the evidence packet with an adoption/defer/reject decision based on
   measured baseline-versus-`mise` results.

## Completion State

The workflow is complete when Story 22.2 is created with acceptance criteria
that require a non-secret `mise` trial, measured friction evidence, stop-line
preservation, and a decision record for adoption, deferral, or custom-code gap
follow-up.
