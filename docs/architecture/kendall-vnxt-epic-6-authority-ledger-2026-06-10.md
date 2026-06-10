# Kendall_vNxt Epic 6 Authority Ledger

Date: 2026-06-10
Status: draft authority ledger

## Purpose

Track current authority levels for the long-running Epic 6 goal.

Approvals are specific to authority family, operation, scope, and evidence. Generic continuation language does not approve new authority.

## Current Authority Matrix

| Authority Family | Current Level | MVP Target | Current Status |
| --- | --- | --- | --- |
| BMAD Candidate creation | Automatic Candidate creation | Automatic | Allowed |
| Candidate priority/order | Manual + recommendations | Manual + recommendations | Allowed |
| Candidate promotion | Bob approval or explicit immediate mode | Bob approval or immediate mode | Allowed for future Story 6.6 |
| Orchestrated routing | Preview/decision only | Automatic decision/evidence | Allowed when implemented |
| Execution attempts | Fake/blocked only | Integrated with orchestrator evidence | Allowed only as fake/blocked until successor story |
| Ollama | Approved current host endpoint/model boundary only | Automatic local-safe checks in approved scope | Limited |
| Codex dry-run/read-only | Not yet approved | Dry-run/read-only checks | Pending future approval |
| Codex implementation | Not approved | Human-approved isolated worktree implementation | Blocked |
| Claude dry-run/read-only | Not yet approved | Dry-run/read-only review checks | Pending future approval |
| Claude review | Not approved | Human-approved or high-risk policy-triggered review-only | Blocked |
| Git read-only | Allowed when implemented | Automatic read-only hygiene | Allowed |
| Local worktree management | Not yet implemented | Approved/policy-bound local worktree create/remove | Pending story |
| GitHub remote write | Not approved | Bob-approved push/PR/delivery | Blocked |
| Merge | Not approved | Bob-approved or stretch | Blocked |
| Local cleanup | Not yet implemented | Automatic after done with evidence | Pending story |
| Remote cleanup | Stretch | Stretch | Blocked |
| Raw prompt/completion retention | Not approved | Not part of MVP | Blocked |

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

