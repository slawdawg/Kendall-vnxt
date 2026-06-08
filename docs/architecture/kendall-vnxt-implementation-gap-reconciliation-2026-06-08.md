# Kendall_vNxt Implementation Gap Reconciliation

Date: 2026-06-08
Scope: Code-aware reconciliation of architecture/PRD gaps against current implementation
Source review artifacts:

- `docs/architecture/kendall-vnxt-overall-architecture.md`
- `docs/architecture/kendall-vnxt-architecture-gap-review-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`

Implementation areas checked:

- `services/supervisor`
- `apps/dashboard`
- `packages/contracts`
- `packages/workflow-core`
- focused supervisor and dashboard tests

## Summary

The earlier architecture reviews were correct as architecture reviews, but some findings refer to missing architecture contracts rather than missing product behavior. The current implementation already has substantial dashboard, routing, worker-registry, evidence, and disabled-execution behavior. It does not yet have a dedicated execution-attempt lifecycle model.

The clean interpretation is:

- Dynamic routing visibility and disabled-provider safety are already code-backed and test-backed.
- Dashboard operator surfaces exist for routing preview, routing fleet, recipe gates, branch preparation, delivery readiness, and managed actions.
- Stale-action protection exists for managed next actions and stale recipe branches, but not for route-decision-bound execution approvals.
- Queue leases have heartbeat/attempt-count mechanics, but they are queue coordination state, not the future `ExecutionAttempt` model.
- Execution Authority Expansion PRD Slice 1 remains valid and should not duplicate existing routing artifacts.

## Status Legend

- **Implemented**: code-backed and reasonably test-backed.
- **Partial**: related behavior exists, but the gap remains for the execution-authority scope.
- **Not implemented**: no dedicated implementation found.
- **Document-only**: captured in docs/PRDs but not runtime behavior.
- **Deferred**: intentionally not implemented yet.

## Reconciliation Matrix

| Gap / Capability | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Dashboard routing preview visibility | Implemented | `apps/dashboard/src/components/routing-preview-panel.tsx:50`, `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx:27`, `tests/e2e/dashboard.spec.ts:295` | The dashboard already shows routing detail on work-item pages. Do not rebuild this for execution attempts; extend it or add a sibling panel. |
| Dashboard compact worker/fleet visibility | Implemented | `apps/dashboard/src/components/routing-fleet-panel.tsx:58`, `apps/dashboard/src/app/controls/page.tsx:13`, `tests/e2e/dashboard.spec.ts:111` | The review gap about fleet visibility is resolved for current registry/lane evidence. Future execution-attempt state will need new fields. |
| Worker registry contract | Implemented | `services/supervisor/src/supervisor/api/main.py:106`, `services/supervisor/src/supervisor/domain/worker_registry.py:22`, `packages/contracts/src/api.ts:293` | Registry is static but real. It records health, permissions, disabled reasons, queue depth, and capabilities. |
| Disabled local provider entries | Implemented | `services/supervisor/src/supervisor/domain/worker_registry.py:57`, `:67`, `:77`, `:87`; tests at `services/supervisor/tests/integration/test_routing_preview.py:578` | Ollama, LM Studio, vLLM, and llama.cpp are represented as disabled, no HTTP/model call workers. |
| Disabled subscription-agent launch | Implemented for stub only | `services/supervisor/src/supervisor/api/main.py:249`, `packages/contracts/src/api.ts:200`, tests at `services/supervisor/tests/integration/test_routing_preview.py:868` | Stub artifacts exist with `processLaunchAllowed: false` and `executionAllowed: false`. Real launch remains deferred. |
| Premium approval artifacts | Implemented for artifact only | `services/supervisor/src/supervisor/api/main.py:232`, `packages/contracts/src/api.ts:181`, tests at `services/supervisor/tests/integration/test_routing_preview.py:770` | Approval request artifacts exist and are non-mutating. Premium execution remains deferred. |
| Subscription handoff packages | Implemented | `packages/contracts/src/api.ts:156`, tests at `services/supervisor/tests/integration/test_routing_preview.py:963` | Handoff packages include `launchAllowed: false`. This is not direct agent launch. |
| Local read-only evidence packet and mock worker preview | Implemented | `services/supervisor/src/supervisor/api/main.py:183`, `:191`; `services/supervisor/src/supervisor/domain/local_readonly_worker.py:21`; tests at `services/supervisor/tests/integration/test_routing_preview.py:595`, `:635` | Mock worker preview is deterministic and non-mutating. Real local model calls remain deferred. |
| Routing outcome evidence | Implemented for guarded utility attempts | `services/supervisor/src/supervisor/application/service.py:1098`, tests at `services/supervisor/tests/integration/test_supervisor_flow.py:1088` | Outcome evidence exists for current guarded utility routing, not for generic execution attempts. |
| Workflow event correlation IDs | Implemented | `services/supervisor/src/supervisor/infrastructure/db/models.py:56`, `packages/contracts/src/api.ts:367` | Events include correlation IDs. Execution-attempt-specific IDs are still missing. |
| Guarded utility worker adapter | Implemented | `services/supervisor/src/supervisor/domain/utility_worker.py:28`, tests at `services/supervisor/tests/integration/test_supervisor_flow.py:997` | Adapter allows only `supervisor_triage` by default and rejects non-allowlisted utility functions. |
| Dashboard command/read boundary | Partial | Read methods in `apps/dashboard/src/lib/supervisor.ts:35-81`; command methods in `:91-179` | Code separates GET-like readers and POST/DELETE commands, but architecture docs do not yet formally classify dashboard command boundaries. |
| Managed action stale protection | Implemented for managed next action | `services/supervisor/tests/integration/test_supervisor_flow.py:962` | Existing stale protection uses `expectedActionId`. Execution approvals still need route-decision binding. |
| Recipe delivery approval gates | Implemented for recipe review | `services/supervisor/tests/integration/test_supervisor_flow.py:1188`, `:1374`, `:1876` | Approval can be blocked until delivery evidence exists. This is not the same as execution-attempt approval binding. |
| Stale branch/workspace guard | Implemented for recipe branch flow | `services/supervisor/tests/integration/test_supervisor_flow.py:2289` | Existing recipe branch stale check should inform, but not replace, execution workspace isolation planning. |
| Queue lease heartbeat/attempt count | Partial | `services/supervisor/src/supervisor/infrastructure/db/models.py:64`, `:69`, `:70`; service markers at `services/supervisor/src/supervisor/application/service.py:2504` | Queue leases include heartbeat, expiry, fencing token, and attempt count. They are not worker execution attempts and should not be overloaded. |
| Dedicated `ExecutionAttempt` model | Not implemented | No `ExecutionAttempt`/attempt endpoint found in `services/supervisor`, `packages/contracts`, or dashboard client | This remains the correct Slice 1 target. |
| Execution attempt history API | Not implemented | Existing work-item events endpoint at `services/supervisor/src/supervisor/api/main.py:119` | Work-item events exist, but no attempt-history endpoint or attempt view exists. |
| Worker lifecycle contract for start/heartbeat/cancel/timeout/complete/fail/cleanup | Not implemented | Worker adapters currently expose narrow `run` or static registry metadata | PRD should add lifecycle contract without enabling real launches. |
| Generic cancellation semantics | Not implemented | No execution-attempt cancel API found | Existing assignment release and state transitions are not worker cancellation. |
| Route-decision-bound execution approval | Not implemented | Premium/subscription artifacts include route data, but no approval command requires `routeDecisionId` for execution | This should remain a core requirement for Execution Authority Expansion. |
| Workspace isolation plan contract for attempts | Not implemented | Recipe branch metadata and stale branch tests exist, but no per-attempt isolation plan contract | Use recipe branch patterns as input, not as substitute. |
| Runtime operational export/backup policy | Document-only / not implemented | `docs/environment-recovery-and-runtime-boundary.md`; no runtime export endpoint found | Recovery docs cover source/docs separation, but local DB/event export is still future work. |
| Threat model for commands/prompts/providers/secrets | Document-only / partial | Safety principles and tests mention no secrets/no launches, e.g. `services/supervisor/tests/integration/test_routing_preview.py:900` | A formal threat model is still missing. |
| Configuration architecture for enabling providers | Partial | Worker registry has disabled reasons and permissions; environment settings exist elsewhere | No central provider enablement precedence model found for execution authority. |
| Adaptive scoring | Deferred | Architecture and PRD defer it | Correctly out of scope until more outcome evidence exists. |

## What Should Change In The Next Implementation Slice

The next slice should not rebuild routing preview, worker registry, local evidence packets, premium artifacts, or dashboard routing fleet visibility. Those are already present.

The next slice should add a small, non-executing execution-attempt spine:

1. Shared contract types for `ExecutionAttemptView`, `ExecutionAttemptStatus`, and `ExecutionAttemptCreateRequest`.
2. Supervisor persistence for attempts, separate from queue leases.
3. Service methods to create planned/rejected attempts from an existing work item and current route decision.
4. Attempt events that include `attemptId`, `workItemId`, `routeDecisionId`, `workerId`, and lane.
5. One-active-attempt-per-work-item invariant.
6. Rejection when the selected lane is disabled for real execution.
7. Focused tests proving no process launch, HTTP call, model call, or source mutation occurs.

## What Should Be Documented, Not Implemented Yet

Before real worker launch, add targeted architecture sections or story acceptance criteria for:

- execution attempt lifecycle transition table,
- approval binding and stale route rejection,
- per-attempt workspace isolation plan,
- cancellation semantics,
- runtime event/export strategy,
- provider enablement config precedence,
- threat model for commands, prompts, local endpoints, and secrets.

## Recommendation

Proceed with a story for PRD Slice 1: **Execution Attempt Contract And State Model**.

This story should explicitly reuse current routing decisions, worker registry entries, workflow events, and dashboard routing components rather than creating a parallel routing system. The new concept is not another router. It is the execution-attempt state layer that sits downstream of routing and upstream of any future real worker execution.
