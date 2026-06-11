# Epic 6 Follow-Up Hardening Delivery Plan

Date: 2026-06-11
Status: local delivery plan, no remote action taken

## Purpose

Package the post-merge Epic 6 hardening branch for review after Bob approves GitHub remote actions.

This plan is evidence only. It does not approve push, PR creation/update, CI waits, merge, branch deletion, cleanup, GitHub issue/story sync, Codex launch, Claude launch, provider expansion, or autonomous delivery.

## Current State

- Local branch: `codex/refresh-epic6-completion-audit`
- Base: `main` at PR #86 merge commit `9cf793f`
- Local commits:
  - `a6be14d` Harden Windows worktree cleanup
  - `0b89921` Refresh Epic 6 completion audit
  - `cd99001` Update Epic 6 post-merge handoff
- Current diff scope:
  - Windows worktree cleanup hardening
  - supervisor pytest cache prevention
  - cleanup runbook
  - Epic 6 completion audit refresh
  - Epic 6 post-merge handoff refresh

## Recommended Packaging

Recommended path: create one focused follow-up PR from `codex/refresh-epic6-completion-audit` to `main`.

Why this is the recommended path:

- The work is one coherent follow-up from the PR #86 merge and cleanup RCA.
- The code and docs are coupled: cleanup tooling prevents the exact Windows failure mode, and the Dev Console audit/handoff now reflects the post-merge state.
- A single focused PR is easier to review than splitting cleanup tooling from the audit refresh because the audit explicitly references the cleanup hardening follow-up.

## Verification Already Run

- `pnpm.cmd run test:codex-workspace`
- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "epic_6_completion_audit or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd run check:docs`
- `pnpm.cmd run check`

Full local check result: dashboard build succeeded and 141 supervisor tests passed with one existing `aiosqlite` deprecation warning.

## Approval Request

Exact approval text Bob can use:

```text
Approve GitHub remote delivery for the Epic 6 follow-up hardening branch only.
Allowed operations:
- push local branch codex/refresh-epic6-completion-audit to origin,
- create or update one PR from that branch to main,
- include a PR body summarizing cleanup hardening, Epic 6 audit refresh, verification, authority boundaries, and remaining blocked operations,
- run read-only PR/CI status checks for that PR.
Do not merge.
Do not delete local or remote branches.
Do not run cleanup.
Do not run Codex or Claude.
Do not perform GitHub issue/story sync.
Retain evidence: branch name, PR URL, pushed commit, CI state if checked, and this delivery plan.
Stop if push is rejected, the remote target is ambiguous, auth changes are requested, or CI fails.
```

## PR Body Draft

Use `docs/goals/epic-6-follow-up-hardening-pr-body-draft-2026-06-11.md` after approval.

## Remaining Gates After PR Creation

Allowed without new merge/cleanup approval after the PR exists:

- read-only PR inspection,
- CI/status refreshes,
- review-comment inspection,
- PR evidence/body prep,
- merge approval packet prep,
- cleanup and rollback planning.

Still separately gated:

- merge,
- local or remote branch deletion,
- local worktree cleanup,
- remote cleanup,
- GitHub issue/story sync,
- Codex or Claude process launch,
- provider/model expansion,
- autonomous delivery.

