# Story 22.1: Workspace Coordination Report

Status: done

## Story

As Bob,
I want concurrent Codex sessions to classify active worktrees and merge-gated
PRs before starting new work,
so that continuous development can keep moving without mixing lanes, deleting
local work, or blocking on one approval gate.

## Acceptance Criteria

1. Given multiple managed worktrees are active, when a session resumes
   continuous development, then a workspace coordination workflow identifies
   root status, active lanes, merge-gated PRs, dirty lanes, clean lanes,
   local-only commits, cleanup candidates, blocked approvals, next safe slice,
   and stop lines.
2. Given cleanup or branch deletion is considered, when this story completes,
   then the workflow requires a cleanup dry-run and a narrow approval packet
   before deleting worktrees, branches, or local commits.
3. Given a PR is waiting at a merge gate, when another safe slice exists, then
   the workflow permits parking that gated lane and starting a non-overlapping
   managed worktree.
4. Given drift checks run, when `pnpm.cmd run check:workspace-coordination`
   executes, then it verifies the workflow document, report packet fields,
   stop lines, next safe slice guidance, and story index entry.
5. Given this story is docs/check automation only, when it completes, then it
   does not merge PRs, clean worktrees, delete branches, discard commits, launch
   workers, call providers, spend money, access credentials, or approve
   execution authority.

## Tasks / Subtasks

- [x] Add workspace coordination workflow. (AC: 1, 2, 3, 5)
  - [x] Define first reads.
  - [x] Define report packet fields.
  - [x] Define lane classification rules.
  - [x] Define stop lines.
  - [x] Define next safe slice rules.
- [x] Add drift check. (AC: 4)
  - [x] Verify workflow document exists.
  - [x] Verify report packet fields.
  - [x] Verify stop lines and non-goals.
  - [x] Wire `check:workspace-coordination` into `pnpm run check`.
- [x] Verify. (AC: 4)
  - [x] Run `pnpm.cmd run check:workspace-coordination`.
  - [x] Run `pnpm.cmd run check:docs`.

### Review Findings

- [x] [Review][Patch] Report missing workspace coordination artifacts as drift-check failures instead of throwing raw `ENOENT` errors [`scripts/check-workspace-coordination-report.mjs`]

## Dev Notes

This story supports continuous development with multiple active Codex lanes. It
does not authorize cleanup, branch deletion, PR merging, provider execution, or
worker launch.

### Guardrails

- Do not merge PRs.
- Do not delete worktrees or branches.
- Do not discard local commits.
- Do not launch workers or managed runtime processes.
- Do not call providers or paid APIs.
- Do not access credentials, sessions, API keys, tokens, account settings, or
  MFA material.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run check:workspace-coordination` passed.
- `pnpm.cmd run check:docs` passed.
- Local review found and patched missing-artifact handling in `scripts/check-workspace-coordination-report.mjs`.

### Completion Notes List

- Added `docs/workflows/workspace-coordination-report.md`.
- Added `scripts/check-workspace-coordination-report.mjs`.
- Added `check:workspace-coordination` to the package check chain.
- Hardened the workspace coordination check so missing artifacts produce actionable drift failures.

### File List

- `docs/workflows/workspace-coordination-report.md`
- `docs/stories/22-1-workspace-coordination-report.md`
- `docs/stories/index.md`
- `package.json`
- `scripts/check-workspace-coordination-report.mjs`

### Change Log

- 2026-06-14: Created workspace coordination report workflow and drift check.
- 2026-06-14: Applied local review patch for missing-artifact handling.
