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

These reports are evidence and approval-prep surfaces only. They do not grant the authority they describe.

## Current Remote Delivery State

Snapshot date: 2026-06-11.

- Open remote PR observed: PR #85 for `codex/implement-story-6-3-candidate-work-model-api`, merge state `CLEAN`, CI `check` success.
- Local branch stack through Story 6.23 is not delivered remotely from this run.
- Push, PR creation/update, CI wait, merge, remote cleanup, and issue/story sync still require explicit Bob approval naming action and scope.

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

When Bob grants approval:

1. Record the approval in this ledger.
2. Record the approval in the relevant story evidence.
3. Re-check whether the approved operation is still the right next step.
4. Execute only within the approved scope.

When Bob denies or narrows approval:

1. Record the decision.
2. Keep the lane/task blocked or update the scope.
3. Continue other safe work if available.
