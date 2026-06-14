---
baseline_commit: 0ac467c3874198e20d6b1dbcf8785243774d7377
---

# Story 21.3: Harden Tool Churn RCA Drift Check

Status: done

## Story

As Bob,
I want the Tool Churn RCA workflow's important rules pinned by the repo check,
so that future edits cannot quietly weaken the stop-retry behavior that keeps agents from wasting tokens on repeated command churn.

## Acceptance Criteria

1. Given `docs/workflows/tool-churn-rca.md` defines trigger conditions, when `pnpm.cmd run check:token-economy` runs, then the check fails if those triggers are removed or renamed without an intentional checker update.
2. Given the workflow defines failure classes, when `pnpm.cmd run check:token-economy` runs, then the check verifies `quoting`, `path-or-tool`, `sandbox`, `permission`, `dependency`, `verification`, `stale-state`, and `unknown` remain present.
3. Given the workflow defines retry stop lines and next safe actions, when `pnpm.cmd run check:token-economy` runs, then those anchors remain pinned so agents stop blind retries and move to a useful diagnostic action.
4. Given the workflow has non-goals, when `pnpm.cmd run check:token-economy` runs, then the check preserves the non-approval boundary for destructive cleanup, GitHub mutation, provider calls, paid usage, credential/session access, worker launch, process launch, and failed-check bypass.
5. Given this story is static drift-check hardening only, when it completes, then it does not install external token tools, adopt compression/cache layers, perform provider calls, launch workers/processes, mutate GitHub, clean worktrees, access credentials, or approve new execution authority.

## Tasks / Subtasks

- [x] Harden the token-economy drift check. (AC: 1, 2, 3, 4)
  - [x] Pin Tool Churn RCA trigger conditions.
  - [x] Pin Tool Churn RCA failure classes.
  - [x] Pin retry stop lines.
  - [x] Pin next safe actions.
  - [x] Pin non-goals and authority boundaries.
- [x] Keep Story 21 artifacts discoverable. (AC: 5)
  - [x] Add Story 21.3 to `docs/stories/index.md`.
  - [x] Add Story 21.3 anchors to `scripts/check-token-economy.mjs`.
- [x] Verify. (AC: 1, 2, 3, 4)
  - [x] Run `pnpm.cmd run check:token-economy`.
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

### Source Context

Start with:

- `docs/stories/21-2-operationalize-token-economy-workflow.md`
- `docs/workflows/tool-churn-rca.md`
- `docs/workflows/tool-churn-rca-examples.md`
- `scripts/check-token-economy.mjs`
- `docs/stories/index.md`

Story 21.2 added the operational examples and first token-economy drift check. This story keeps that same check and makes it stricter, focused on preserving the rules that prevent repeated tool retries.

### Expected Implementation Shape

Update `scripts/check-token-economy.mjs` with exact-string anchors for stable workflow text. Keep the checker deterministic and dependency-free. Do not create a second checker unless the token-economy script becomes too broad to understand.

### Guardrails

Do not:

- install or adopt Headroom, CC Usage, Defluffer, Redis LangCache, provider prompt caching, or other external token tools,
- call providers or paid APIs,
- launch Codex, Claude, subscription agents, workers, or shell commands as managed runtime actions,
- mutate GitHub, merge PRs, sync issues, or cleanup worktrees,
- read credentials, sessions, API keys, tokens, account settings, or MFA material,
- remove approval gates, stop lines, evidence requirements, or Bob steering points.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- BMAD create-story resolver was not used because this fresh worktree did not have `services/supervisor/.venv`; after two failed attempts to use that path, work followed the Tool Churn RCA stop-retry rule and used the existing Story 21.2 file pattern.
- `pnpm.cmd run check:token-economy` passed after hardening the checker.
- `pnpm.cmd run check:docs` passed after adding Story 21.3 to the index.

### Completion Notes List

- Added static assertions for Tool Churn RCA trigger conditions, failure classes, retry stop lines, next safe actions, and non-goals.
- Added Story 21.3 and indexed it under Draft Epic 21.
- Preserved the existing `check:token-economy` entry point and full check-chain wiring.

### File List

- `docs/stories/21-3-harden-tool-churn-rca-drift-check.md`
- `docs/stories/index.md`
- `scripts/check-token-economy.mjs`

### Change Log

- 2026-06-14: Hardened Tool Churn RCA drift checks and added Story 21.3.
