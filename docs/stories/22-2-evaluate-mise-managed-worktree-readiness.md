---
baseline_commit: b3a4b3c70179ae79100081996eeaf4b3fd7afd40
---

# Story 22.2: Evaluate mise Managed Worktree Readiness

Status: done

## Story

As Bob,
I want Kendall_Nxt to evaluate `mise` as the standard managed-worktree
readiness layer,
so that new and parallel worktrees are easier to enter without Kendall_Nxt
reinventing environment management.

## Context

Research on `direnv`, `mise`, dotenvx, Devbox, Nix, Dev Containers, Claude
Code worktrees, Git worktrees, and `scripts/codex-workspace.mjs` concluded that
Kendall_Nxt should use mature tools and standard workflows first.

The current decision is:

- keep Git worktrees as the lifecycle primitive;
- keep `scripts/codex-workspace.mjs` as the Kendall_Nxt governance wrapper;
- evaluate `mise` first for tool activation, non-secret env defaults, and task
  aliases;
- use dotenvx only for command-scoped env injection when needed;
- defer Nix, Devbox, and Dev Containers until reproducibility or isolation pain
  is proven;
- write custom code last, only for Kendall_Nxt-specific governance/evidence
  gaps.

This story is an evaluation story. It does not approve a mandatory `mise`
rollout or a custom readiness checker.

Current state: baseline managed-worktree readiness is measured. The
`mise`-managed trial was completed in a scoped `/tmp` install after Bob unblocked
the trial. The original result was to defer tracked `mise` adoption because
setup and preflight failed under mise-managed pnpm in the then-current repo
scripts. A later local retry after pnpm shim command-resolution hardening passed
setup, preflight, and workspace doctor with `--skip-tools` against the existing
scoped/offline tool install, but tracked `mise` adoption remains deferred until
that hardening is merged and rerun from a clean `main` baseline.

## Acceptance Criteria

1. Given a managed experiment worktree, when the story runs the current baseline
   setup workflow, then it records command count, elapsed setup time, prompts,
   manual steps, missing host prerequisites, and whether `pnpm run setup` and
   `pnpm run preflight` pass.
2. Given a non-secret `mise` proposal/config, when `mise install`,
   `mise run setup`, `mise run preflight`, and `mise run workspace-doctor` are
   tested, then the story records command count, elapsed setup time, prompts,
   manual steps, active tool versions, setup/preflight/doctor results, and
   changed files.
3. Given `mise` is not available on the host, when the story reaches the `mise`
   trial, then it records `mise_missing` as a host prerequisite and stops before
   installing global tooling unless Bob explicitly approves a separate install
   operation.
4. Given Kendall_Nxt's existing version sources of truth, when the `mise` trial
   defines tool versions, then it uses Node `22.13.0`, pnpm `11.5.2`, and
   Python `3.12` unless the story documents a repo-backed reason to change
   them.
5. Given existing package scripts are the source of truth, when `mise` tasks are
   defined, then they delegate to `pnpm run setup`, `pnpm run preflight`, and
   `pnpm run codex:workspace:doctor` instead of replacing those workflows.
6. Given provider/API secrets are authority-sensitive, when the `mise` trial
   completes, then no provider/API secrets, `.env` files, raw credentials,
   sessions, or account material are loaded by default.
7. Given the goal is mature tooling first, when the story completes, then it
   records a decision to adopt, defer, or reject tracked `mise` config based on
   measured friction evidence and identifies any remaining gaps that require
   custom Kendall_Nxt code.
8. Given this story is readiness evaluation only, when it completes, then it
   does not replace `scripts/codex-workspace.mjs`, create or remove worktrees
   outside the managed experiment, add Nix/Devbox/Dev Containers, launch
   workers, call providers, spend money, access credentials, push, create PRs,
   merge, delete branches, delete worktrees, or perform cleanup.

## Tasks / Subtasks

- [x] Prepare the trial scope. (AC: 1, 8)
  - [x] Select one managed experiment worktree.
  - [x] Confirm current branch, worktree path, and clean/dirty state.
  - [x] Confirm `mise` is treated as optional during the trial.
- [x] Capture baseline workflow evidence. (AC: 1)
  - [x] Record commands, elapsed time, prompts/manual steps, and missing host
        prerequisites.
  - [x] Run or document the smallest safe setup/preflight path for the
        worktree.
- [x] Check `mise` availability. (AC: 3)
  - [x] If `mise` is present, continue the trial.
  - [x] If `mise` is missing, record `mise_missing` and stop before installing
        global tooling unless Bob separately approves that install operation.
- [x] Add the non-secret `mise` proposal/config. (AC: 2, 4, 5, 6)
  - [x] Use Node `22.13.0` from `.node-version`.
  - [x] Use pnpm `11.5.2` from `package.json`.
  - [x] Use Python `3.12` because it satisfies both Python package constraints.
  - [x] Define tasks that delegate to existing package scripts.
  - [x] Avoid provider/API secrets and dotenv loading by default.
- [x] Capture `mise` workflow evidence. (AC: 2, 6)
  - [x] Run or document `mise install`.
  - [x] Run or document `mise run setup`.
  - [x] Run or document `mise run preflight`.
  - [x] Run or document `mise run workspace-doctor`.
  - [x] Record active versions and changed files.
- [x] Record the decision. (AC: 7)
  - [x] Compare baseline against `mise`.
  - [x] Decide adopt, defer, or reject tracked `mise` config.
  - [x] Identify remaining custom-code gaps, if any.
- [x] Verify stop lines. (AC: 8)
  - [x] Confirm no secrets were loaded by default.
  - [x] Confirm no worktree cleanup, branch deletion, provider calls, paid calls,
        worker launches, GitHub mutation, or remote mutation occurred.

## Dev Notes

Primary workflow:

- `docs/workflows/mise-managed-worktree-readiness-evaluation.md`

Research inputs:

- `docs/research/standard-worktree-workflow-tooling-recommendation-2026-06-18.md`
- `docs/research/worktree-environment-method-comparison-decision-research-2026-06-18.md`
- `docs/research/direnv-alternatives-for-kendall-nxt-technical-research-2026-06-18.md`
- `docs/research/direnv-git-worktrees-agentic-programming-technical-research-2026-06-18.md`

Repo sources of truth:

- `.node-version`
- `package.json`
- `services/supervisor/pyproject.toml`
- `runtime/pyproject.toml`
- `scripts/codex-workspace.mjs`

Candidate `mise` config shape:

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

The first implementation should prefer an example/proposal config if making
`mise.toml` tracked would prematurely impose the tool on every developer.

### Guardrails

- Do not make `mise` mandatory in this story.
- Do not install `mise` or any global tooling unless Bob explicitly approves
  that separate install operation.
- Do not load provider/API secrets or dotenv files by default.
- Do not replace package scripts with `mise` task bodies.
- Do not replace `scripts/codex-workspace.mjs`.
- Do not add a custom readiness checker unless the measured trial proves a
  specific uncovered gap.
- Do not add Nix, Devbox, or Dev Containers in this story.
- Do not run provider calls, paid calls, process launches, worker launches,
  GitHub mutation, cleanup, branch deletion, or worktree removal.

### Result and Next Action

Owner: Bob.

Result:

```text
Do not adopt a tracked mise config yet. The local follow-up retry removes the
observed setup/preflight blocker, but adoption still needs a clean post-merge
trial from main.
```

Next safe action:

```text
Merge the pnpm shim hardening when it is part of a coherent delivery batch,
then rerun the scoped mise readiness trial from main before deciding whether to
track a mise config.
```

### Acceptance Status

| AC | Status |
| --- | --- |
| AC1 | Complete: baseline setup/preflight evidence recorded. |
| AC2 | Complete: controlled `mise` install/run evidence recorded; original setup/preflight failed under mise-managed pnpm, and local scoped/offline `--skip-tools` retry passed after pnpm shim hardening. |
| AC3 | Complete: `mise_missing` recorded and install stopped. |
| AC4 | Complete: mise activated Node `22.13.0`, pnpm `11.5.2`, and Python `3.12.13`; baseline drift recorded. |
| AC5 | Complete: temp tasks delegated to existing package scripts. |
| AC6 | Complete for trial evidence: no dotenv copy; env-name check printed no secret values and found only `GH_PAGER`. |
| AC7 | Complete: measured trial and follow-up retry support deferring tracked mise adoption until pnpm shim hardening is merged and rerun from `main`. |
| AC8 | Complete: stop lines preserved. |

Follow-up note: after local pnpm shim hardening on branch `research/brainstorming`,
the scoped/offline `mise run --skip-tools` retry passed setup, preflight, and
workspace doctor. This updates the technical blocker evidence but does not
reopen the completed story or approve tracked `mise` adoption.

### Review Findings

- [x] [Review][Patch] Separate baseline readiness from `mise`-managed readiness.
- [x] [Review][Patch] Record explicit baseline command count.
- [x] [Review][Patch] Avoid marking unexecuted `mise` acceptance criteria as satisfied.
- [x] [Review][Patch] Clarify secret-boundary evidence is passive for baseline and blocked for `mise`.
- [x] [Review][Patch] Define approval scope for `mise install` and tool/cache mutation.
- [x] [Review][Patch] Record host Node/Python drift and distinguish uv-selected Python.
- [x] [Review][Patch] Add ignored-state evidence for dependency and virtualenv churn.
- [x] [Review][Patch] Add continuation path after explicit approval.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `git rev-parse HEAD` -> `b3a4b3c70179ae79100081996eeaf4b3fd7afd40`
- `pwd` -> `/home/slaw_dawg/.codex-workspaces/slawdawg-kendall-vnxt/worktrees/research-brainstorming`
- `git branch --show-current` -> `research/brainstorming`
- `node --version` -> `v22.22.1`
- `pnpm --version` -> `11.5.2`
- `uv --version` -> `uv 0.11.21`
- `python3 --version` -> `Python 3.14.4`
- `command -v mise` -> not found
- `node ./scripts/codex-workspace.mjs doctor` passed
- `/usr/bin/time -f 'elapsed=%E exit=%x' pnpm run setup` initially failed in
  sandbox because uv could not write to `/home/slaw_dawg/.cache/uv`; approved
  rerun passed in `0:01.34`
- `/usr/bin/time -f 'elapsed=%E exit=%x' pnpm run preflight` passed in
  `0:00.77`
- controlled `mise` install to `/tmp/kendall-mise-trial/bin/mise` passed
- `mise install` passed in `0:05.73`
- `mise exec -- node --version` -> `v22.13.0`
- `mise exec -- pnpm --version` -> `11.5.2`
- `mise exec -- python --version` -> `Python 3.12.13`
- `mise run setup` failed in `0:10.40` after scoped HOME/config adjustment
  because repo setup resolves mise-managed pnpm through `node ./pnpm`
- `mise run preflight` failed in `0:10.41` because repo preflight could not
  validate pnpm availability under mise-managed pnpm
- `mise run workspace-doctor` passed in `0:10.42`
- env-name secret check printed no secret values and found only `GH_PAGER`
- follow-up retry after local pnpm shim hardening:
  `mise run --skip-tools setup`, `mise run --skip-tools preflight`, and
  `mise run --skip-tools workspace-doctor` passed in the scoped offline trial

### Completion Notes List

- BMAD dev-story workflow started for Story 22.2.
- Baseline managed worktree readiness is proven with existing tools: setup,
  preflight, and workspace doctor pass.
- `mise` is not available on PATH. The `mise` execution path is deferred rather
  than attempted because story guardrails prohibit installing global tooling
  without Bob's explicit approval.
- Bob later unblocked the controlled `mise` trial. `mise` was installed and run
  from `/tmp/kendall-mise-trial` without shell activation or shell-profile edits.
- Host Node is `v22.22.1` while `.node-version` pins `22.13.0`; baseline
  preflight accepts the supported range, but the drift remains a candidate
  reason to evaluate `mise` after approval.
- uv selected CPython `3.12.13` for supervisor setup, satisfying the shared
  Python default recommendation.
- Party-mode architecture, development, and test perspectives agreed to defer
  `mise` adoption until the local script compatibility fix is merged and a clean
  post-merge trial passes from `main`.
- BMAD code review found overclaiming in the original evidence language. The
  story now separates complete baseline evidence from blocked `mise` evidence.
- Controlled `mise` trial result: direct version activation works. The original
  repo setup/preflight paths failed under mise-managed pnpm, but the local
  follow-up retry passed after pnpm shim hardening. Tracked `mise` config
  adoption remains deferred pending merge and clean post-merge validation.
- BMAD code-review findings were patched and resolved; story is complete with
  tracked `mise` adoption deferred.

### File List

- docs/stories/index.md
- docs/stories/22-2-evaluate-mise-managed-worktree-readiness.md
- docs/workflows/mise-managed-worktree-readiness-evaluation.md
- docs/workflows/mise-managed-worktree-readiness-evidence-2026-06-18.md

### Change Log

- 2026-06-18: Created story from worktree environment tooling research and
  mature-tool-first recommendation.
- 2026-06-18: Started BMAD dev-story execution.
- 2026-06-18: Recorded baseline readiness evidence and deferred `mise` trial
  pending explicit install/use approval.
- 2026-06-18: Addressed BMAD code-review findings for evidence overclaiming,
  approval scope, version drift, ignored state, and continuation steps.
- 2026-06-18: Completed controlled `mise` trial and moved story to review with
  adoption deferred.
- 2026-06-18: Completed BMAD code review and marked story done.
