# Kendall_vNxt Epic 6 Authority Ledger

Date: 2026-06-11
Status: current authority ledger

## Purpose

Track current authority levels for the long-running Epic 6 goal.

Approvals are specific to authority family, operation, scope, and evidence. Generic continuation language does not approve new authority.

## Current Authority Matrix

| Authority Family | Current Level | MVP Target | Current Status |
| --- | --- | --- | --- |
| BMAD Candidate creation | Automatic Candidate creation | Automatic | Allowed |
| Candidate priority/order | Manual + recommendations | Manual + recommendations | Allowed |
| Candidate promotion | Bob approval or explicit immediate mode | Bob approval or immediate mode | Allowed |
| Orchestrated routing | Preview/decision/evidence | Automatic decision/evidence | Allowed |
| Execution attempts | Fake/blocked only | Integrated with orchestrator evidence | Allowed only as fake/blocked until successor approval |
| Ollama | Approved current host endpoint/model boundary only | Automatic local-safe checks in approved scope | Limited |
| Codex dry-run/read-only | No-launch readiness only | Dry-run/read-only checks | Prepared; real CLI invocation still blocked |
| Codex implementation | Not approved | Human-approved isolated worktree implementation | Blocked |
| Claude dry-run/read-only | No-launch readiness only | Dry-run/read-only review checks | Prepared; real CLI invocation still blocked |
| Claude review | Not approved | Human-approved or high-risk policy-triggered review-only | Blocked |
| Git read-only | Read-only local hygiene | Automatic read-only hygiene | Allowed |
| Local worktree management | Plan-only | Approved/policy-bound local worktree create/remove | Creation/removal blocked |
| GitHub remote write | Not approved | Bob-approved push/PR/delivery | Blocked |
| Merge | Not approved | Bob-approved or stretch | Blocked |
| Local cleanup | Readiness only | Automatic after done with evidence | Deletion blocked |
| Remote cleanup | Readiness only | Stretch | Blocked |
| Trusted low-risk autonomy | Readiness only | Stretch | Blocked |
| Raw prompt/completion retention | Not approved | Not part of MVP | Blocked |

## Current Evidence Surfaces

- Codex: `GET /supervisor/codex-readiness-report` and `GET /supervisor/codex-implementation-approval-report`.
- Claude: `GET /supervisor/claude-review-readiness-report` and `GET /supervisor/claude-review-approval-report`.
- GitHub delivery: `GET /supervisor/github-delivery-authority-report`.
- Local cleanup: `GET /supervisor/local-cleanup-readiness-report`.
- Remote cleanup/sync: `GET /supervisor/remote-cleanup-sync-readiness-report`.
- Trusted autonomy: `GET /supervisor/trusted-autonomy-readiness-report`.
- Epic completion audit: `GET /supervisor/epic-6-completion-audit-report`.
- MVP proof trial packet: `GET /supervisor/epic-6-mvp-proof-trial-report`.

These reports are evidence and approval-prep surfaces only. They do not grant the authority they describe.

## Current Remote Delivery State

Snapshot date: 2026-06-11.

- PR #85, PR #86, PR #87, PR #88, PR #89, and PR #90 are merged into `main`.
- PR #90 delivered the read-only Epic 6 MVP proof trial packet from `codex/epic-6-mvp-proof-run`.
- Current `main` verification passed after PR #90 with `pnpm.cmd run check`, including dashboard build and 143 supervisor tests.
- Future branch deletion, local cleanup, remote cleanup, Codex launch, Claude launch, push/PR delivery, merge, and issue/story sync still require explicit Bob approval naming action and scope.

## Approval Request Format

Every approval request should include:

- authority family,
- exact operation,
- target work item/story,
- allowed paths or target resources,
- expected command/tool shape,
- evidence to retain,
- rollback or cleanup plan,
- stop conditions,
- whether approval is one-time, story-scoped, or policy-scoped.

## Async Unblocking Rule

Bob may approve, deny, or modify a pending authority request later. While waiting, the long-running goal should continue safe unblocked work.

When an approval-gated operation is reached, use two lanes:

1. Blocked lane: park the exact gated operation with approval scope, stop conditions, and retained evidence requirements.
2. Continue lane: keep working on safe local or read-only work that still advances the goal, such as local verification, docs, PR body prep, read-only PR/CI/review inspection, merge packet prep, cleanup plans, follow-on story specs, tests, and root-cause fixes.

Do not stop the entire long-running goal at the first gated operation unless no meaningful safe work remains.

## Progressive PR Gate Softening

Creating a PR under explicit approval and seeing CI pass lowers risk for the next narrow actions, but it does not grant downstream authority.

Allowed without a new merge/cleanup approval after an approved PR exists and CI is green:

- read-only PR inspection,
- CI/status refreshes,
- review-comment inspection,
- PR body or evidence-comment preparation,
- merge approval packet preparation,
- cleanup and rollback planning.

Still separately gated unless Bob grants a one-time or standing policy:

- merge,
- closing superseded PRs,
- local or remote branch deletion,
- local worktree cleanup,
- GitHub issue/story sync,
- Codex or Claude process launch,
- autonomous end-to-end delivery.

Default next gate after an approved PR has green CI and clean merge state is a narrow merge approval packet, not a broad authority request.

When Bob grants approval:

1. Record the approval in this ledger.
2. Record the approval in the relevant story evidence.
3. Re-check whether the approved operation is still the right next step.
4. Execute only within the approved scope.

When Bob denies or narrows approval:

1. Record the decision.
2. Keep the lane/task blocked or update the scope.
3. Continue other safe work if available.
