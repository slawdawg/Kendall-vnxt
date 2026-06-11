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
| Codex implementation | Completed for Story 3.66 MVP proof; post-MVP implementation gated | Human-approved isolated worktree implementation | `epic-6-low-risk-doc-evidence-pr-v1` active; Story 3.66 proof branch delivered and cleaned up; additional non-doc/evidence implementation remains blocked |
| Claude dry-run/read-only | No-launch readiness only | Dry-run/read-only review checks | Prepared; real CLI invocation still blocked |
| Claude review | Not approved | Human-approved or high-risk policy-triggered review-only | Blocked |
| Git read-only | Read-only local hygiene | Automatic read-only hygiene | Allowed |
| Local worktree management | Plan-only | Approved/policy-bound local worktree create/remove | Creation/removal blocked |
| GitHub remote write | Completed for Epic 6 MVP proof PRs; post-MVP writes gated | Bob-approved push/PR/delivery | PR #97 delivery completed; future remote writes require scoped approval or policy |
| Merge | Completed for Epic 6 MVP proof PRs; post-MVP merges gated | Bob-approved or stretch | PR #97 merge completed; future merges require scoped approval or policy |
| Local cleanup | Completed for Epic 6 MVP proof targets; post-MVP deletion gated | Automatic after done with evidence | PR #96 and PR #97 branches/worktrees cleaned up after evidence retention |
| Remote cleanup | Readiness only | Stretch | Blocked |
| Trusted low-risk autonomy | Active for doc/evidence PR preparation only | Stretch | Allowed only for `epic-6-low-risk-doc-evidence-pr-v1`; merge, cleanup, issue sync, Claude, providers, secrets, destructive operations, and failed-check bypass remain blocked |
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
- Low-risk doc/evidence autonomy policy: `docs/goals/epic-6-low-risk-doc-evidence-autonomy-policy-proposal-2026-06-11.md`.

These reports are evidence and approval-prep surfaces only. They do not grant the authority they describe.

## Current Remote Delivery State

Snapshot date: 2026-06-11.

- PR #85, PR #86, PR #87, PR #88, PR #89, PR #90, PR #91, PR #92, PR #93, PR #94, PR #96, and PR #97 are merged into `main`.
- PR #90 delivered the read-only Epic 6 MVP proof trial packet from `codex/epic-6-mvp-proof-run`.
- Current `main` verification passed after PR #90 with `pnpm.cmd run check`, including dashboard build and 143 supervisor tests.
- PR #91 delivered the initial Story 3.61 bounded doc/evidence proof trial. PR #92 refreshed post-proof authority docs. PR #93 proposed `epic-6-low-risk-doc-evidence-pr-v1`. PR #94 activated `epic-6-low-risk-doc-evidence-pr-v1` on `main`.
- Future post-MVP branch deletion, local cleanup, remote cleanup, Claude launch, provider expansion, GitHub delivery, merge, and issue/story sync still require explicit Bob approval naming action and scope or a new standing policy.
- PR #91 and PR #92 provide initial evidence for `epic-6-low-risk-doc-evidence-pr-v1`.
- On 2026-06-11, Bob approved `epic-6-low-risk-doc-evidence-pr-v1`: for matching doc/evidence-only changes, Codex may create an isolated branch/worktree from `main`, implement bounded documentation/evidence changes, run `pnpm.cmd run check`, commit, push, open one PR to `main`, and run read-only PR/CI checks without per-step approval. Auto-merge, cleanup, issue sync, Claude launch, provider expansion, secrets access, destructive operations, failed-check bypass, and unrelated source changes remain separately gated.
- On 2026-06-11, Bob approved standing Epic 6 completion authority for PR creation/update, CI inspection, merge, and cleanup when scoped to Epic 6 completion work with clean status, green verification, green CI, clean merge state, and retained evidence. This approval did not grant Claude launch, provider expansion, secrets access, issue sync, unrelated deletion, or broad post-MVP autonomy.

## Current Epic 6 MVP Proof Trial State

Snapshot date: 2026-06-11.

- Selected successor proof story: `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md`.
- Current supervisor proof instance: `http://127.0.0.1:8010` using repo-local proof database `.data/epic-6-proof-supervisor.db`.
- Candidate Work: `8afea99f-bb79-4f51-a66c-f1b02dff9005`, approved from `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md` with metadata-only BMAD import retention.
- Active WorkItem: `a8e43bba-a2dd-4b2e-b995-22fecea85611`.
- Task packet/routing evidence selected `local_readonly` with preview-only authority, no provider calls, and no command execution.
- Local evidence event: `local-evidence-route-a8e43bba-a2dd-4b2e-b995-22fecea85611-epic-6-mvp-proof-local-evidence-task_classification`.
- Runtime export: `runtime-evidence-export-a8e43bba-a2dd-4b2e-b995-22fecea85611`.
- Local proof-selection commit: `1c79711` on `codex/epic-6-proof-selection-evidence`.
- Proof-selection PR: `https://github.com/slawdawg/Kendall-vnxt/pull/96`.
- PR #96 CI `check` passed on 2026-06-11, then PR #96 was marked ready and merged into `main` at `c35ff16339fd53c502b328e3f3b120a303f905e1` after explicit approval.
- PR #96 branch `codex/epic-6-proof-selection-evidence` was deleted locally and remotely after separate cleanup approval.
- PR #96 merge approval packet: `docs/goals/epic-6-real-story-trial-approval-packet-2026-06-11.md`.
- Story 3.66 bounded implementation scope: `docs/goals/epic-6-real-story-trial-approval-packet-2026-06-11.md`.
- Current state: after proof-selection docs were committed and the dirty-repo blocker was cleared, the WorkItem reached `implementing` state. Runtime evidence still shows zero execution attempts and all process/provider/command/source-mutation authority flags disabled.
- Current bounded implementation authority: Bob approved one Story 3.66 local Codex implementation in isolated worktree `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260611-epic-6-mvp-proof-story-3-66-bounded-implementati` on branch `codex/epic-6-mvp-proof-story-3-66-bounded-implementati`, limited to the approved proof scope and `pnpm.cmd run check`.
- Story 3.66 bounded local implementation verification passed with focused report tests and full `pnpm.cmd run check`, including preflight, drift checks, dashboard build, and 143 supervisor integration tests.
- PR #97 delivered the Story 3.66 implementation evidence: `https://github.com/slawdawg/Kendall-vnxt/pull/97`.
- PR #97 CI `check` passed on 2026-06-11, then PR #97 was marked ready and merged into `main` at `a750601af1d0144507f6cc05b3ca1ada676d2d07`.
- PR #97 branch/worktree `codex/epic-6-mvp-proof-story-3-66-bounded-implementati` was deleted locally and remotely after retained evidence.
- Final proof report state: `GET /supervisor/epic-6-mvp-proof-trial-report` reports `trialStatus=epic_6_mvp_proof_complete`; `GET /supervisor/epic-6-completion-audit-report` reports `epicComplete=true`.
- Final completion update verification passed with focused report tests and full `pnpm.cmd run check`, including preflight, drift checks, dashboard build, and 143 supervisor tests.
- Current stop line: post-MVP Claude review, provider expansion, issue/story sync, additional Codex launches, remote cleanup outside approved targets, and broad trusted autonomy remain separately gated.

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
