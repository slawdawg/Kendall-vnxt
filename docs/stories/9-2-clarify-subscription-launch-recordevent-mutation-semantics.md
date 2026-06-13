---
baseline_commit: e07aad9d2e174a400695e6bd36134e5c5678ab86
---

# Story 9.2: Clarify Subscription Launch `recordEvent` Mutation Semantics

Status: done

## Story

As Bob,
I want subscription launch `recordEvent` mutation semantics to be explicit and idempotent,
so that launch evidence cannot be corrupted by duplicate, partial, failed, stale, or out-of-order event writes.

## Acceptance Criteria

1. Given a subscription launch event is recorded, when `recordEvent` mutates launch state or evidence, then the contract defines which fields may change, which fields are immutable, and which derived states are recomputed, and the mutation result is reconstructable from retained metadata.
2. Given the same event identity or idempotency key is recorded more than once, when `recordEvent` evaluates the duplicate event, then the repeated event is a no-op or stable update, and it does not create duplicate mutation, duplicate evidence, contradictory launch state, or retry behavior.
3. Given a distinct valid event identity is recorded, when `recordEvent` accepts the event, then the event is appended or applied exactly once according to the documented mutation contract, and event identity, ordering, and replay behavior are explicit rather than inferred.
4. Given duplicate, partial, failed, stale, or out-of-order event writes occur, when the mutation contract is evaluated, then Kendall fails closed, preserves inspectable evidence, and avoids advancing launch readiness from ambiguous state.
5. Given subscription event fixtures are needed, when tests are authored, then fixtures are limited to subscription, event-store, and idempotency cases, and they do not validate broad runtime launch behavior or launch retry automation.
6. Given launch authority remains bounded, when mutation semantics are clarified, then the change does not grant source mutation, real launch retry automation, provider expansion, credential/session access, failed-check bypass, PR/merge/cleanup automation, or broad autonomy.

## Tasks / Subtasks

- [x] Define the subscription launch `recordEvent` mutation contract. (AC: 1, 3, 4, 6)
  - [x] Identify the public request surfaces that accept or imply `recordEvent`, especially `WorkItemSubscriptionAgentLaunchRequest` and `WorkItemRoutingPreviewRequest`.
  - [x] Document whether each path is read-only evaluation, rejection-event persistence, or accepted fixture attempt persistence.
  - [x] Define immutable fields, mutable fields, derived state recomputation, event identity, ordering, replay behavior, and failure behavior.
- [x] Add focused supervisor tests for idempotent event recording. (AC: 2, 3, 4, 5)
  - [x] Cover duplicate subscription launch request/event identity.
  - [x] Cover distinct valid event identity appending or applying exactly once.
  - [x] Cover invalid, stale, partial, or out-of-order inputs failing closed without partial mutation or readiness advancement.
  - [x] Keep fixtures limited to subscription launch request/event-store/idempotency behavior.
- [x] Implement the smallest contract change needed. (AC: 1-6)
  - [x] Reuse existing `WorkflowEvent`, `ExecutionAttempt`, and subscription launch evidence models.
  - [x] Do not introduce a parallel subscription launch lifecycle model.
  - [x] Do not add real launch retry automation, source mutation, provider expansion, credential/session access, failed-check bypass, PR/merge/cleanup automation, or broad autonomy.
- [x] Update static/documentation evidence. (AC: 1, 5, 6)
  - [x] Update relevant story or architecture notes only where needed to make `recordEvent` mutation semantics durable.
  - [x] Update drift checks only if subscription launch mutation semantics would otherwise silently drift.
- [x] Update story and verification evidence. (AC: 1-6)
  - [x] Record focused and full verification commands in this story.
  - [x] Update Completion Notes and File List during implementation.

### Review Findings

- [x] [Review][Patch] Accepted replay trusts any existing attempt row — fixed by validating existing accepted fixture attempts against work item, route decision, worker, lane, authority mode, completed status, event refs, and artifact refs before treating replay as idempotent.
- [x] [Review][Patch] Duplicate rejection identity is too coarse for changed payloads — fixed by fingerprinting rejection status, readiness, missing/rejected/stale fields, and blocked reasons before deduplicating.
- [x] [Review][Patch] Read-only accepted fixture response looks completed — fixed by returning `accepted_artifact_only_fixture_evaluation_ready` and `subscription_launch_fixture_evaluation_ready` when `recordEvent=False`.
- [x] [Review][Patch] Mutation contract remains implicit — fixed by adding `mutationContract` to the API/schema response and event payloads with mode, event identity, immutable fields, derived state, replay behavior, ordering, failure behavior, and authority boundary.
- [x] [Review][Patch] `mutation_attempted` should be a strict boolean — fixed by wrapping the expression in `bool(...)`.
- [x] [Review][Patch] Drift guard should cover the new semantics — fixed by adding runtime-export drift assertions for `mutationContract`, rejection fingerprinting, accepted replay identity checks, and read-only evaluation status.

## Dev Notes

### Source Context

- Epic 9 asks for an explicit and idempotent subscription launch `recordEvent` contract. Story 9.2 covers FR31, FR33, NFR14, and the Epic 9 test fixture invariant. [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.2: Clarify Subscription Launch recordEvent Mutation Semantics`]
- Epic 8 deferred this exact issue: "`recordEvent` behavior for subscription launch request evaluation is deferred and should get a focused contract pass." [Source: `_bmad-output/implementation-artifacts/epic-8-retro-2026-06-13.md#Challenges`]
- Deferred work records the implementation pointer: "Subscription launch request `recordEvent` default is ignored by the Story 8.5 launch endpoint." [Source: `_bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 8-6-record-verification-recovery-and-rollback-evidence (2026-06-12)`]

### Current Implementation To Inspect

- `packages/contracts/src/api.ts` defines `recordEvent?: boolean` on request contracts including routing preview and subscription launch request shapes.
- `services/supervisor/src/supervisor/application/service.py` contains the subscription launch request evaluation and event persistence path:
  - `get_subscription_agent_launch_request(...)` computes approval/missing/stale/rejected state, builds `SubscriptionAgentLaunchRequestView`, and currently records a rejection event or accepted fixture attempt.
  - `_record_subscription_agent_launch_rejection_event(...)` persists rejected launch evidence.
  - `_record_subscription_agent_launch_fixture_attempt(...)` persists an accepted artifact-only fixture attempt and its lifecycle events.
  - `_record_subscription_agent_launch_fixture_event(...)` writes metadata-only accepted fixture events.
  - `get_subscription_agent_launch_stub(...)` creates a routing preview with `recordEvent=False`, which is the nearby read-only pattern.
- `services/supervisor/tests/integration/test_routing_preview.py` contains existing subscription launch request, accepted fixture, rejected request, verification, recovery, rollback, runtime export, and raw-output exclusion tests. Extend those tests instead of creating an unrelated test suite.

### Previous Story Intelligence

- Story 9.1 hardened runtime evidence drift checks with local deterministic fixtures and live source-surface assertions. If 9.2 changes subscription launch evidence shapes, update `scripts/check-runtime-evidence-export.mjs` only when needed so the new semantics cannot silently drift.
- Story 9.1 preserved the existing failure-collection style and avoided a parallel verifier. Apply the same approach here: extend existing event/evidence models instead of inventing a new mutation engine.

### Architecture And Safety Boundaries

- Subscription-agent process launch remains disabled unless a later exact approval authorizes it. This story is about metadata/event mutation semantics only.
- Future process execution must attach to `ExecutionAttempt`, not `QueueLease`; avoid a second lifecycle model. [Source: `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md#Lifecycle States`]
- Output and artifact evidence must remain bounded references and summaries, not raw stdout, stderr, generated patch content, prompts, completions, provider payloads, secrets, or source snapshots. [Source: `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md#Output And Artifact Requirements`]
- Generic continuation language does not approve process launch, provider calls, command execution, source mutation by workers, network access, credential access, premium execution, external sends, or background runtime assistant behavior. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Language That Is Not Approval`]

### Fixture Ownership

- Story 9.2 owns subscription launch request, event-store, and idempotency fixtures only.
- Story 9.2 must not own 9.1 static report/schema/drift fixtures or 9.3 dashboard/rendering/raw-output fixtures.
- Fixtures and tests must run locally without live provider calls, subscription credentials, external sessions, process launch, source mutation, network access, PR/merge/cleanup automation, or failed-check bypass.

### Testing

Minimum focused verification:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"`
- `pnpm.cmd run check:runtime-export` if runtime export evidence semantics change.
- `pnpm.cmd run check:docs` when story/docs/index artifacts change.

Broaden before review:

- `pnpm.cmd run check`

## Project Structure Notes

- Story record location: `docs/stories/`.
- Shared request contracts: `packages/contracts/src/api.ts`.
- Supervisor launch semantics: `services/supervisor/src/supervisor/application/service.py`.
- Subscription launch domain contract: `services/supervisor/src/supervisor/domain/subscription_launch.py`.
- Existing supervisor integration tests: `services/supervisor/tests/integration/test_routing_preview.py`.
- Avoid broad dashboard work here; Story 9.3 owns provider raw-output UI regression coverage.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/epic-8-retro-2026-06-13.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`
- `docs/stories/9-1-harden-static-drift-checks.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

- Red phase: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_request_default_record_event_is_read_only or subscription_agent_launch_request_record_event_true_persists_rejection_once or subscription_agent_launch_request_rejects_second_fixture_attempt_for_work_item"` failed with three expected failures: default `recordEvent=False` mutated, duplicate rejection wrote two events, and duplicate accepted fixture replay returned 409.
- Green phase: the same focused command passed with 3 passed.
- Focused subscription launch slice: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` passed with 14 passed.
- Drift check: `pnpm.cmd run check:runtime-export` passed after adding static guard assertions for `recordEvent` semantics.
- Documentation check: `pnpm.cmd run check:docs` passed.
- Full regression: `pnpm.cmd run check` passed, including dashboard build and 165 supervisor tests.
- Code review patch verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch"` passed with 16 tests, `pnpm.cmd run check:runtime-export` passed, `pnpm.cmd run check:docs` passed, and full `pnpm.cmd run check` passed with 167 supervisor tests.

### Completion Notes List

- Clarified subscription launch request mutation semantics: `recordEvent=False` is now read-only evaluation and does not write workflow events or execution attempts.
- Made repeated `recordEvent=True` rejected launch requests idempotent by deduplicating existing rejection evidence by launch request identity.
- Made repeated accepted fixture requests with the same execution attempt stable instead of creating duplicate evidence or raising a conflict; distinct mismatched attempt/workspace identities still fail closed as stale.
- Added focused supervisor tests for read-only evaluation, idempotent rejection recording, and accepted fixture replay stability.
- Added runtime-export drift assertions so the read-only default and rejection deduplication semantics cannot silently drift.
- Preserved existing `WorkflowEvent`, `ExecutionAttempt`, and subscription launch evidence models; no parallel lifecycle, provider expansion, source mutation, credential/session access, launch retry automation, PR/merge/cleanup automation, failed-check bypass, or broad autonomy was added.
- Resolved BMAD code-review findings by making accepted replay identity strict, adding rejection fingerprints, distinguishing read-only accepted fixture evaluation from completed mutation, exposing an explicit mutation contract, and expanding focused tests.

### File List

- `docs/stories/9-2-clarify-subscription-launch-recordevent-mutation-semantics.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-runtime-evidence-export.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-13: Implemented explicit and idempotent subscription launch `recordEvent` mutation semantics and moved Story 9.2 to review.
- 2026-06-13: Resolved BMAD code-review findings and moved Story 9.2 to done.
