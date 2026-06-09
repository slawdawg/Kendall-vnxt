# Kendall_vNxt Implementation Gap Reconciliation

Date: 2026-06-08
Updated: 2026-06-08 after Story 2.8 and connector workflow polish
Scope: Code-aware reconciliation of architecture and PRD gaps against current implementation

Source review artifacts:

- `docs/architecture/kendall-vnxt-overall-architecture.md`
- `docs/architecture/kendall-vnxt-architecture-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-8-threat-boundary-for-commands-prompts-providers-and-secrets.md`

Implementation areas checked:

- `services/supervisor`
- `apps/dashboard`
- `packages/contracts`
- `tests/e2e`
- focused supervisor integration tests

## Summary

The prior reconciliation was correct when written, but it is now stale. The execution-authority control-plane spine has been implemented through Story 2.8.

Current state:

- Dynamic routing, worker registry, handoff artifacts, premium approval artifacts, local evidence packets, disabled subscription-agent stubs, and fleet visibility are implemented.
- Execution attempts are first-class supervisor state with creation, rejection, lifecycle transitions, route-bound approval, history, workspace isolation metadata, runtime evidence export, and dashboard visibility.
- Disabled execution configuration checks and worker threat-boundary surfaces exist and are test-backed.
- Real external/local worker execution remains intentionally deferred.

The remaining work is no longer "add execution attempts." The next useful work is to harden the architecture and product around future enablement: dependency gates, command/read boundary documentation, provider enablement precedence, richer attempt reporting, and later controlled worker execution only after explicit decisions.

## Status Legend

- **Implemented**: code-backed and reasonably test-backed.
- **Documented**: captured in architecture or story docs but not yet a runtime behavior.
- **Partial**: related behavior exists, but the remaining gap is still meaningful.
- **Deferred**: intentionally not implemented until a later approval or PRD.

## Reconciliation Matrix

| Capability | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Dashboard routing preview visibility | Implemented | `apps/dashboard/src/components/routing-preview-panel.tsx`, `tests/e2e/dashboard.spec.ts` | Work-item pages show route rationale. |
| Dashboard compact worker/fleet visibility | Implemented | `apps/dashboard/src/components/routing-fleet-panel.tsx`, controls page tests | Registry/lane evidence is visible without making fleet the product center. |
| Worker registry contract | Implemented | `services/supervisor/src/supervisor/domain/worker_registry.py`, `packages/contracts/src/api.ts` | Static registry records health, permissions, disabled reasons, queue depth, and capabilities. |
| Disabled local provider entries | Implemented | Worker registry and routing preview tests | Ollama, LM Studio, vLLM, and llama.cpp remain disabled/no-call workers. |
| Guarded utility worker adapter | Implemented | `services/supervisor/src/supervisor/domain/utility_worker.py`, guarded utility tests | Allows only narrow internal deterministic behavior. |
| Routing outcome evidence | Implemented | `worker.utility_attempt_recorded` and routing outcome tests | Present for guarded utility attempts. |
| Dedicated `ExecutionAttempt` model | Implemented | `services/supervisor/src/supervisor/infrastructure/db/models.py`, Story 2.1 | Attempts are separate from queue leases. |
| Execution attempt create/history API | Implemented | `GET/POST /work-items/{id}/execution-attempts`, Story 2.1 | Planned/rejected attempts are persisted and reviewable. |
| Attempt lifecycle transitions | Implemented | `POST /work-items/{id}/execution-attempts/{attempt_id}/lifecycle`, Story 2.2 | Supports control-plane status changes without launching workers. |
| Route-bound approval | Implemented | Story 2.3 tests and service validation | Approval requires route, worker, lane, and authority binding. |
| Workspace isolation plan contract | Implemented | `WorkspaceIsolationPlanView`, Story 2.4 | Attempts include read/write/artifact/forbidden path and disabled-permission evidence. |
| Dashboard attempt evidence panel | Implemented | `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`, Story 2.5 | Work-item detail shows attempt and isolation evidence. |
| Disabled execution configuration checks | Implemented | `GET /supervisor/execution-configuration-checks`, Story 2.6 | Reports process/provider/model/premium/command/source/network/credential denial. |
| Runtime evidence export | Implemented | `GET /work-items/{id}/runtime-evidence-export`, Story 2.7 | Exports work item, attempts, events, boundaries, and safety flags. |
| Worker threat boundary | Implemented | `GET /supervisor/threat-boundary`, Story 2.8 | Formalizes command, prompt, provider, network, credential, and artifact boundaries. |
| Connector-backed GitHub workflow | Implemented | `docs/github-connector-workflow.md`, Story 3.4 | Documents Git/GCM plus Codex GitHub connector split. |
| Dashboard command/read boundary | Implemented | `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`, Story 3.6 | Classifies read-only, record-only, workflow, guarded managed, approval-bearing, and execution-prohibited surfaces. |
| Deferred authority dependency graph | Documented | `docs/architecture/kendall-vnxt-authority-dependency-graph-2026-06-08.md`, Story 3.5 | Names prerequisites for future provider, process, command, source, network, credential, and scoring authority. |
| Provider enablement precedence | Implemented | `GET /supervisor/execution-readiness-report`, `docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md`, Story 3.7 | Centralizes PRD, threat, settings, registry, permission, dashboard, tests, and rollback gates before enablement. |
| Compact attempt evidence reporting | Implemented | `ExecutionReadinessReportView.currentAttempts`, dashboard controls panel | Summarizes recent attempts, disabled reasons, latest evidence, and next safe action. |
| Reporting-only outcome evidence expansion | Implemented | `ExecutionReadinessReportView.latestOutcomes`, routing outcome events | Surfaces lane, worker, task kind, validation, failure, escalation, and override fields without adaptive scoring. |
| Queue lease vs execution attempt boundary | Implemented | `GET /supervisor/execution-state-boundary`, `docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md`, Story 3.8 | Separates scheduling state from worker-authority evidence and names fields forbidden from leases. |
| Provider-specific disabled adapter proofs | Implemented | `GET /supervisor/disabled-provider-proofs`, readiness report provider proofs | Ollama, LM Studio, vLLM, and llama.cpp expose no-call proof evidence. |
| Real local provider calls | Deferred | Threat boundary and config checks deny calls | Requires future PRD and provider-specific safety decision. |
| Direct subscription-agent process launch | Deferred | Launch stub is disabled | Requires process lifecycle, workspace policy, approval, cancellation, and secret/session handling. |
| Premium execution | Deferred | Approval request artifacts only | Requires premium provider boundary and explicit approval policy. |
| Adaptive scoring | Deferred | Outcome evidence exists but corpus is small | Use reporting first; scoring waits for enough audited outcomes. |

## Current Gap Interpretation

The architecture gap has moved from missing execution-attempt primitives to missing enablement governance.

The highest-value next work should:

1. Keep architecture docs aligned with the implemented non-executing control plane.
2. Design process lifecycle for future subscription-agent launch.
3. Draft provider-specific PRDs from readiness and no-call proof evidence.
4. Use execution-readiness reports to decide when a provider-specific PRD has enough evidence.
5. Only then implement the next controlled worker execution capability.

## Recommended Next Backlog

1. **Process Lifecycle Design Record**: design subscription-agent process supervision after attempt/workspace boundaries are explicit.
2. **Provider-Specific PRD Drafting**: draft the first local-provider PRD from disabled provider proofs and readiness evidence.
3. **Provider Disabled Adapter Fixture Expansion**: add provider-specific redaction and timeout fixture cases before any HTTP adapter.
4. **Runtime Evidence Export Polish**: include readiness report and boundary references in work-item exports if useful for operator review.

## Stop Conditions

Stop for explicit operator approval before any change that would:

- launch a subscription-agent process,
- call a local or remote model/provider endpoint,
- enable premium execution,
- permit arbitrary shell commands,
- allow worker source mutation,
- grant worker network access,
- read credentials or secret files,
- change destructive Git or filesystem behavior.

Everything above the stop line can proceed as architecture, documentation, tests, or non-executing control-plane work.
