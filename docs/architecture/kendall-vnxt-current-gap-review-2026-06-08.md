# Kendall_vNxt Current Gap Review And Recommendations

Date: 2026-06-08
Status: current recommendation
Scope: Architecture, PRDs, stories, supervisor implementation, dashboard implementation, and routing follow-on work

## Summary

The dynamic routing foundation is no longer the main gap. The current repo has code-backed and test-backed routing preview, route rationale, lane evidence, worker registry, guarded utility routing, local read-only packet previews, disabled local provider entries, subscription handoff artifacts, premium approval artifacts, and disabled subscription-agent launch stubs.

The remaining gap is the execution authority layer that sits between routing decisions and any future real worker execution. Kendall_vNxt can explain where work should go and can execute a tiny guarded utility path, but it does not yet have a first-class execution attempt model for planned/running/cancelled/failed/completed worker attempts.

The next work should therefore focus on making execution attempts explicit, observable, cancelable, route-bound, and safe before enabling real local model calls or subscription-agent launches.

## What Is Already Covered

Do not rebuild these as new architecture work:

- Work-item routing preview and route rationale in the dashboard.
- Compact routing fleet/worker registry surface.
- Static worker registry with disabled provider entries.
- Guarded utility worker adapter for narrow deterministic supervisor behavior.
- Routing outcome evidence for guarded utility attempts.
- Local read-only evidence packet and deterministic mock worker preview.
- OpenAI-compatible local provider entries represented as disabled/no-call workers.
- Subscription handoff package generation.
- Premium approval request artifact generation.
- Disabled subscription-agent launch stub artifacts.
- Managed action stale protection and recipe branch stale protection.
- Recovery/runtime boundary documentation.

## Current Gaps

### 1. Dedicated Execution Attempt State

There is no supervisor-owned `ExecutionAttempt` model, shared API type, or attempt history endpoint. Queue leases have heartbeat and attempt counts, but those are coordination leases, not worker execution attempts.

Risk: future worker launch could overload queue state, making cancellation, status history, route binding, and artifact correlation unclear.

Recommendation: implement PRD Slice 1 next: `Execution Attempt Contract And State Model`.

### 2. Route-Decision-Bound Execution Approval

Routing decisions exist, and approval/handoff artifacts include route data, but future execution approval is not yet bound to a current `routeDecisionId` plus worker/lane/authority snapshot.

Risk: an operator could approve one decision while the work item, route, or worker target has changed.

Recommendation: after attempt state exists, require all attempt approval commands to include the current route decision and reject stale or mismatched approvals.

### 3. Lifecycle And Cancellation Semantics

The architecture names lifecycle needs, but there is no generic lifecycle contract for start, heartbeat, cancel, timeout, completion, failure, artifact capture, and cleanup.

Risk: once real workers exist, the supervisor may be able to start work without being able to stop it cleanly or explain what happened.

Recommendation: implement lifecycle events and cancel-request recording using disabled/mock workers only before process launch is considered.

### 4. Workspace Isolation Plan Contract

Recipe branch safeguards exist, but there is no per-attempt workspace isolation plan that defines read roots, write roots, artifact roots, forbidden paths, cleanup, rollback, and diff capture.

Risk: future mutating workers could inherit broad repo access without a reviewable boundary.

Recommendation: add a non-executing `WorkspaceIsolationPlan` to attempts before enabling any mutating worker lane.

### 5. Runtime Evidence Export Is Still Document-Level

Recoverability is well documented for source, docs, and runtime separation. Operational runtime state such as local database events and attempt history does not yet have an export/backup path.

Risk: the Git repo can recover the environment shape, but not necessarily the supervisor's operational evidence trail after local machine loss.

Recommendation: defer full export until attempt events exist, then add JSONL event/attempt export or a documented SQLite backup/export command.

### 6. Provider Enablement Policy Is Not Centralized Yet

The worker registry correctly distinguishes disabled providers, but provider enablement precedence is not yet formalized across config, registry, PRD policy, dashboard copy, and tests.

Risk: future code could accidentally make a provider capable and executable through a config shortcut without matching governance approval.

Recommendation: add a disabled-default configuration check slice after attempt state and history are in place.

### 7. Threat Model Is Still Too General

Safety principles exist, and tests enforce no-launch/no-call behavior in several places. A formal threat model for commands, prompts, local endpoints, credentials, and artifact storage is still missing.

Risk: local workers and subscription agents introduce prompt leakage, secret exposure, command injection, network access, and path-boundary risks that need a more specific review before real execution.

Recommendation: create a short targeted threat model before any real local provider or subscription-agent execution PRD.

### 8. Dashboard Attempt Evidence Is Missing

Dashboard routing and fleet panels exist, but there is no attempt evidence panel because attempt state does not exist yet.

Risk: once attempts are added, operators could see the route but not the status, rejection reason, cancellation state, or artifact evidence of the attempted execution.

Recommendation: build dashboard attempt visibility only after the backend attempt history API exists.

### 9. Adaptive Scoring Remains Premature

Routing outcome evidence exists, but the corpus is not rich enough to tune scoring safely.

Risk: adaptive scoring could optimize on sparse or misleading evidence and make the router less predictable.

Recommendation: keep adaptive scoring deferred until execution attempt outcomes include validation result, runtime, failure class, escalation reason, and operator override evidence.

## Recommended Build Order

1. Create Story: Execution Attempt Contract And State Model.
2. Implement shared contracts, persistence, create/reject service behavior, and focused tests.
3. Add attempt lifecycle events and work-item attempt history API.
4. Add route-decision-bound approval and stale decision rejection.
5. Add workspace isolation plan contract to every attempt.
6. Add dashboard attempt evidence panel on the work-item detail page.
7. Add disabled execution configuration checks for subscription agents, local providers, and premium execution.
8. Create targeted threat model for worker execution, prompts, local endpoints, secrets, and artifacts.
9. Add runtime evidence export/backup once attempts and events are worth exporting.
10. Only then consider real local provider calls or subscription-agent process launch PRDs.

## Recommended Immediate Story

Title: Execution Attempt Contract And State Model

Goal: Add a non-executing supervisor execution-attempt spine downstream of routing and upstream of future worker execution.

Acceptance outline:

- Add shared contract types for `ExecutionAttemptView`, `ExecutionAttemptStatus`, and attempt creation input.
- Add supervisor persistence for attempts separate from queue leases.
- Link each attempt to `workItemId`, `routeDecisionId`, `workerId`, lane, and authority mode.
- Reject attempt creation when there is no route decision or when the selected worker/lane is disabled for real execution.
- Enforce one active attempt per work item.
- Record attempt planned/rejected events with attempt identifiers.
- Expose attempt history for a work item, or create the service/repository shape needed for the next history slice.
- Prove through tests that the slice performs no process launch, HTTP call, model call, shell command, or source mutation.

## BMad Recommendation

BMad should route next to `bmad-create-story` for the execution attempt state slice, then `bmad-dev-story` or `bmad-quick-dev` for implementation. The story should explicitly cite this gap review, the implementation reconciliation, and the execution authority PRD so it does not duplicate completed routing, registry, local evidence, handoff, premium, or dashboard fleet work.

## Stop Conditions For The Next Slice

Stop for approval only if implementation would require one of these:

- real process launch,
- real local model/provider HTTP calls,
- premium provider calls,
- broad source mutation,
- destructive file operations,
- credential access,
- externally hosted services,
- changing the recovery/runtime boundary.

Everything else in the immediate execution-attempt state slice is inferable from current repo patterns and should proceed with conservative defaults.
