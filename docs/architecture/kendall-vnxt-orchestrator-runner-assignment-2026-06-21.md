---
title: Kendall_vNxt Orchestrator Runner Assignment Spec
status: draft implementation contract
created: 2026-06-21
---

# Kendall_vNxt Orchestrator Runner Assignment Spec

## Purpose

Close the gap between Kendall_Nxt's advisory orchestrator reports and a safe runner-dispatch workflow for future end-to-end lanes.

This spec extends:

- `kendall-vnxt-orchestrator-spec-2026-06-10.md`
- `../workflows/workspace-coordination-report.md`
- `../workflows/end-to-end-lane-runner.md`

## Problem

The supervisor can show safe backlog items and next-lane handoffs, and `scripts/codex-workspace.mjs` can start, resume, finish, and clean managed worktrees. The missing contract is assignment: the orchestrator does not yet own a source-defined way to decide which ready lane is dispatchable, claim it for a runner, observe runner progress, detect stale ownership, or block unsafe takeover.

Without this contract, a runner can see the right next lane but must stop whenever that lane is marked owned by another runner, even if the ownership is stale or already completed elsewhere.

## Design Principles

1. Assignment is evidence, not inference.
2. One lane can have at most one active runner assignment.
3. Ownership guards remain authoritative until takeover evidence proves otherwise.
4. Authority-blocked work is never dispatchable from generic continuation.
5. The first implementation must be read-only/report-only before any claim mutation.
6. Claim and takeover commands must be idempotent and leave durable evidence.
7. Dev Console must show assignment state, owner, heartbeat, blockers, and next safe action.

## Capability Contract

| ID | Capability | Intent | Success signal |
| --- | --- | --- | --- |
| ORA-001 | Assignment inventory | List ready, active, closed, blocked, stale, and ambiguous lanes from safe backlog plus workspace manifests. | A read-only report explains why each candidate is dispatchable or not. |
| ORA-002 | Unowned lane claim | Claim only an unowned ready lane for the current runner. | `claim-next --dry-run` previews the exact lane; `claim-next --apply` writes assignment evidence only for an unowned ready lane. |
| ORA-003 | Runner lease | Record owner, runner/thread id, acquired time, heartbeat time, phase, command, and stale-after policy. | Active lanes expose current lease metadata and last heartbeat evidence. |
| ORA-004 | Stale owner detection | Classify stale ownership from lease age plus worktree, branch, and PR evidence. | Stale candidates become blocked takeover packets, not silent reassignment. |
| ORA-005 | Takeover gate | Allow reassignment only after explicit takeover evidence and policy approval. | Owned active lanes cannot be mutated by another runner without `--take-ownership` and a takeover reason that cites evidence. |
| ORA-006 | Dispatch handoff | Prepare or resume the managed workspace and hand the lane to a compatible runner. | Dispatch records worktree, branch, owner, readiness result, and next command without hidden mutation. |
| ORA-007 | Delivery tracking | Track verification, PR, merge, cleanup, and rollback state for assigned lanes. | The assignment report shows current delivery state and missing evidence before merge or cleanup. |
| ORA-008 | Dev Console visibility | Show runner assignment and blocker state to the operator. | The Dev Console can distinguish assignable, active, stale, blocked, delivered, and cleanup-ready lanes. |

## Data Model

### `LaneAssignment`

Minimum fields:

- `assignment_id`
- `task_id`
- `lane_slug`
- `branch`
- `worktree_path`
- `status`
- `owner`
- `owner_thread_id`
- `assigned_at`
- `updated_at`
- `source_backlog_item`
- `authority_profile`
- `stop_lines`

Statuses:

- `assignable`
- `claimed`
- `active`
- `verification`
- `review`
- `delivery`
- `merged`
- `cleanup`
- `closed`
- `blocked_authority`
- `blocked_owned_active`
- `blocked_stale_owner_needs_takeover`
- `blocked_dirty_worktree`
- `blocked_failed_verification`
- `blocked_missing_pr_evidence`
- `blocked_external_review`
- `ambiguous`

### `RunnerLease`

Minimum fields:

- `owner`
- `owner_thread_id`
- `runner_kind`
- `capabilities`
- `acquired_at`
- `last_heartbeat_at`
- `stale_after_seconds`
- `phase`
- `current_command`
- `last_result`

### `TakeoverDecision`

Minimum fields:

- `previous_owner`
- `requesting_owner`
- `reason`
- `heartbeat_evidence`
- `worktree_evidence`
- `branch_evidence`
- `pr_evidence`
- `dirty_state_evidence`
- `approval_evidence`
- `decision`

## State Flow

```text
ready
  -> claimed
  -> active
  -> verification
  -> review
  -> delivery
  -> merged
  -> cleanup
  -> closed
```

Blocked flow:

```text
ready
  -> blocked_owned_active
  -> blocked_stale_owner_needs_takeover
  -> claimed
```

Takeover may enter `claimed` only after the takeover gate passes. Failed evidence leaves the lane blocked with a next safe action.

## Command Contract

### Read-only report

Initial command:

```bash
node ./scripts/codex-workspace.mjs assignment-report
```

Expected behavior:

- reads safe backlog guidance and workspace manifests,
- reports assignable and blocked candidates,
- does not create, edit, delete, push, merge, or clean any lane.

### Claim preview and apply

Initial command:

```bash
node ./scripts/codex-workspace.mjs claim-next --dry-run
node ./scripts/codex-workspace.mjs claim-next --apply
```

Rules:

- claim only unowned ready lanes,
- never claim authority-blocked lanes,
- never claim active owned lanes,
- fail closed when safe backlog state, workspace manifests, or branch evidence is ambiguous,
- write durable assignment evidence when applying.

### Heartbeat

Initial command:

```bash
node ./scripts/codex-workspace.mjs heartbeat <task>
```

Rules:

- current owner only,
- updates heartbeat and phase,
- never changes branch, PR, or cleanup state.

## Progressive Implementation

### Phase 1: Source-Owned Contract

Deliver this spec and index references. No mutation.

### Phase 2: Read-Only Assignment Report

Add a supervisor report and CLI read-only output that classify lanes as assignable, active, stale, blocked, or ambiguous.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs assignment-report`
- reads safe backlog guidance from `services/supervisor/src/supervisor/application/service.py#get_safe_development_backlog_report`,
- reads managed workspace manifests from the Codex workspace state root,
- classifies safe backlog candidates and workspace assignments without mutating manifests, branches, PRs, or worktrees,
- reports stale-owner takeover blockers as evidence only.

### Phase 3: Claim Dry Run

Add `claim-next --dry-run` with deterministic candidate selection and complete blocker evidence.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs claim-next --dry-run`
- `node ./scripts/codex-workspace.mjs claim-next --dry-run --summary-json`
- selects the first ready safe-backlog lane with source-owned `nextLane` start metadata and no active workspace or branch conflict,
- previews existing unowned-workspace claims when an unowned active manifest already exists for the selected branch,
- prints blocker evidence for authority-blocked, ambiguous, owned-active, stale-owner, duplicate-manifest, and branch-conflict candidates,
- emits bounded summary JSON with selected lane, status counts, blocker status counts, and a truncated blocker sample for runner automation,
- refuses `--apply` until Phase 4 implements mutation under the assignment evidence contract.

### Phase 4: Claim Apply

Allow `claim-next --apply` only for unowned ready lanes. It should create or update assignment metadata but not run implementation.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs claim-next --apply`
- writes `LaneAssignment` metadata under the local Codex workspace state root for an unowned ready safe-backlog lane,
- refreshes the same assignment idempotently when the current runner already owns it,
- blocks another runner from claiming an existing assignment owned by a different runner,
- claims an existing unowned active workspace by updating only that manifest's owner evidence,
- re-reads manifests and assignments under the relevant local lock before writing, and fails closed if the candidate changed,
- does not create branches, create worktrees, push, open PRs, launch workers, start implementation, or mutate authority-blocked work.

### Phase 5: Lease And Heartbeat

Persist runner heartbeat and phase. Use heartbeat only as evidence; do not use it as sole authority for takeover.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs heartbeat <task-or-assignment>`
- updates only the current owner's assignment or workspace manifest,
- records `last_heartbeat_at`, `stale_after_seconds`, `phase`, `runner_kind`, `current_command`, `last_result`, and heartbeat event evidence,
- surfaces phase, heartbeat, and runner metadata in `assignment-report`,
- rejects unowned lanes and lanes owned by another runner, even when takeover flags are provided,
- does not change branch, PR, cleanup, delivery, or ownership state.

### Phase 6: Takeover Gate

Add explicit takeover packets. Takeover requires operator approval unless a future source-owned policy grants a narrow low-risk takeover class.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs takeover <task-or-assignment> --dry-run`
- `node ./scripts/codex-workspace.mjs takeover <task-or-assignment> --apply`
- emits a `TakeoverDecision` packet with previous owner, requesting owner, reason, heartbeat evidence, worktree evidence, branch evidence, PR evidence, dirty-state evidence, approval evidence, decision, and blockers,
- requires stale heartbeat evidence before ownership mutation,
- requires clean worktree evidence for workspace-manifest takeover,
- requires explicit operator approval evidence and a takeover reason before `--apply`,
- updates owner metadata only after re-reading the target under the relevant local lock,
- blocks non-stale, unowned, current-owner, missing-worktree, dirty-worktree, and missing-approval takeover attempts without mutation.

### Phase 7: Dispatch Loop

Add a local orchestrator command that claims one lane, prepares the workspace, runs readiness, and records the handoff to a compatible runner.

Initial CLI implementation:

- `node ./scripts/codex-workspace.mjs dispatch-next --dry-run`
- `node ./scripts/codex-workspace.mjs dispatch-next --apply`
- reuses the proven `claim-next` candidate selection and blocker rules,
- claims or refreshes exactly one safe backlog lane for the current runner,
- claims an existing unowned workspace or creates a managed workspace from source-owned branch metadata when no active workspace exists,
- records dispatch handoff evidence on the workspace manifest and assignment metadata when present,
- supports bounded readiness profiles: `doctor`, `preflight`, and `none`,
- stops after handoff evidence; it does not launch workers, make provider/model calls, push, open PRs, merge, clean up, or mutate authority-blocked work.

## Safety Invariants

- No provider/model calls.
- No paid usage.
- No worker or process launch in the first implementation phases.
- No automatic takeover without evidence and approval.
- No bypass of existing lane owner guards.
- No mutation of authority-blocked work.
- No merge or cleanup beyond the existing low-risk delivery gates.
- No raw prompt, completion, reasoning trace, provider payload, secret, or unnecessary source-copy retention.

## Verification Requirements

Focused checks for future implementation:

- `pnpm run check:workspace-coordination`
- `pnpm run check:safe-backlog`
- `pnpm run check:development-runway`
- `pnpm run check:delivery-readiness`
- `pnpm run check:cleanup-automation`
- `pnpm run test:codex-workspace`

Final gate:

- `pnpm run check:static`

Negative tests required before claim mutation:

- owned active lane is not claimed,
- stale lane is not taken without evidence,
- authority-blocked lane is never dispatched,
- dirty worktree blocks cleanup and takeover,
- missing heartbeat produces blocker evidence, not silent reassignment,
- PR merge requires exact head evidence,
- cleanup requires merged PR and clean worktree evidence.

## External Pattern Notes

- Kubernetes Lease objects demonstrate compact ownership records with holder identity, duration, acquire time, and renewal time.
- Temporal Task Queues separate task creation from worker polling and keep tasks durable while workers are unavailable.
- Celery task acknowledgement guidance reinforces that retry/requeue paths require idempotent work and explicit failure behavior.
- GitHub Actions concurrency groups provide a simple one-active-run-per-group pattern with explicit pending/cancel behavior.

These are patterns, not dependencies. Kendall_Nxt should first extend its local supervisor and workspace protocol before adopting a heavier orchestration runtime.

## References

- Kubernetes Leases: `https://kubernetes.io/docs/concepts/architecture/leases/`
- Temporal Task Queues: `https://docs.temporal.io/task-queue`
- Celery task acknowledgement and rejection guidance: `https://docs.celeryq.dev/en/stable/userguide/tasks.html`
- GitHub Actions concurrency groups: `https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency`

## Open Questions

- What default heartbeat interval and stale threshold should local Codex runners use?
- Should heartbeat writes come only from `codex-workspace.mjs`, or may long-running lane agents update assignment state directly?
- Should runner capabilities be configured statically, passed as CLI arguments, or derived from the runner command?
- Should the read-only assignment report be implemented first as supervisor API, CLI output, or both?
