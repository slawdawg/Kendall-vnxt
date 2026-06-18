# Story 22.3: Implement mise Normal Workflow

Status: done

## Story

As Bob,
I want `mise` implemented as Kendall_Nxt's normal supported local readiness
workflow,
so that each local worktree can activate the repo's expected tool versions and
run familiar setup/check commands with less friction.

## Context

Story 22.2 evaluated `mise` and deferred tracked adoption until the pnpm shim
hardening landed on `main` and a clean post-merge trial passed. PR #146 merged
that hardening as `c08e563 Harden research workflow readiness`.

This story implements the smallest tracked `mise` integration that preserves
the existing workflow model:

- Git worktrees remain the lifecycle primitive.
- `scripts/codex-workspace.mjs` remains the governed workspace wrapper.
- `pnpm` package scripts remain the command source of truth.
- `uv` remains the Python environment manager.
- `mise` only pins non-secret tool versions and provides task aliases that
  delegate to existing package scripts.

## Acceptance Criteria

1. Given the repaired research-brainstorming worktree at current `origin/main`,
   when the post-merge scoped `mise` trial runs, then `mise run setup`,
   `mise run preflight`, and `mise run workspace-doctor` pass without
   `--skip-tools`.
2. Given a tracked repo `mise.toml`, when a developer uses `mise`, then it pins
   Node `22.13.0`, pnpm `11.5.2`, and Python `3.12` from existing repo-backed
   sources of truth.
3. Given existing package scripts are authoritative, when `mise` tasks are
   defined, then they delegate to `pnpm run setup`, `pnpm run preflight`,
   `pnpm run codex:workspace:doctor`, and `pnpm run check`.
4. Given provider/API secrets and lifecycle authority are sensitive, when the
   tracked config is added, then it does not define `[env]`, hooks, plugins,
   dotenv loading, provider/API secrets, provider calls, paid calls, worker
   launch, process launch, GitHub mutation, PR/merge automation, cleanup,
   branch deletion, worktree removal, local commit discard, shell profile edits,
   Graphify commands, Linux install lane work, or competing lifecycle
   automation.
5. Given the integration is now normal supported workflow, when repo static
   checks run, then a drift check verifies the tracked `mise` config, story,
   and evidence stay aligned.
6. Given Story 22.2 remains historical evaluation, when this story completes,
   then evidence records the post-merge adoption decision without reopening the
   completed evaluation story.

## Tasks / Subtasks

- [x] Run post-merge scoped `mise` validation. (AC: 1)
  - [x] Confirm `mise --version`.
  - [x] Confirm `mise exec -- node --version`.
  - [x] Confirm `mise exec -- pnpm --version`.
  - [x] Confirm `mise exec -- python --version`.
  - [x] Run `mise run setup`.
  - [x] Run `mise run preflight`.
  - [x] Run `mise run workspace-doctor`.
- [x] Add tracked `mise.toml`. (AC: 2, 3, 4)
  - [x] Pin Node, pnpm, and Python.
  - [x] Add task aliases that delegate to package scripts.
  - [x] Avoid env, hooks, plugins, dotenv, secrets, and lifecycle automation.
- [x] Add drift check coverage. (AC: 5)
  - [x] Verify pinned versions.
  - [x] Verify task aliases.
  - [x] Verify evidence/story/index references.
  - [x] Wire check into `check:static`.
- [x] Record implementation evidence. (AC: 6)
  - [x] Document commands, results, risks, and stop lines.
  - [x] Update Story 22.2 evidence with forward pointer.
  - [x] Update story index.

## Dev Notes

Tracked config:

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

[tasks.check]
run = "pnpm run check"
```

This intentionally does not add `[env]`, hooks, plugins, dotenv handling, shell
activation, global install automation, provider/API configuration, or a custom
readiness lifecycle.

## Evidence

- `docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md`
- `mise.toml`
- `scripts/check-mise-workflow.mjs`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `git rev-parse --short HEAD` -> `c08e563`
- `mise --version` -> `2026.6.11 linux-x64 (2026-06-16)`
- `mise exec -- node --version` -> `v22.13.0`
- `mise exec -- pnpm --version` -> `11.5.2`
- `mise exec -- python --version` -> `Python 3.12.13`
- `mise run preflight` -> pass
- `mise run workspace-doctor` -> pass with scoped-HOME state-root warning
- `mise run setup` -> pass
- `mise run check` -> pass outside the sandbox; dashboard build passed;
  supervisor suite reported 205 passed, 1 known aiosqlite deprecation warning

### Completion Notes

- Implemented `mise` as a normal supported local readiness workflow.
- Preserved existing package scripts and Codex workspace governance as the
  source of truth.
- Added static drift coverage so tracked config cannot silently diverge from
  story/evidence expectations.
- No Linux install lane work, provider calls, paid calls, worker launches,
  process launches, Graphify commands, GitHub mutations, PR/merge automation,
  cleanup, branch deletion, worktree removal, local commit discard, shell
  profile edits, or credential/session access occurred.
