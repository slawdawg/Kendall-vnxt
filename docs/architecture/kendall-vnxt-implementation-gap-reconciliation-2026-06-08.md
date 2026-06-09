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
| Dashboard command/read boundary | Partial | `apps/dashboard/src/lib/supervisor.ts` separates helpers by method shape | The code shape exists; architecture should formally classify commands, reads, and approval-bearing actions. |
| Queue lease vs execution attempt boundary | Partial | `QueueLease` and `ExecutionAttempt` are separate models | Needs an explicit architecture note so future work does not overload queue leases. |
| Provider enablement precedence | Partial | Disabled settings and registry checks exist | Needs a central policy describing PRD decision, config, registry, dashboard copy, and tests required before enabling a provider. |
| Dependency graph for deferred authority | Documented gap | Overall architecture lists deferred items | Needs a concrete dependency graph for local provider calls, subscription-agent launch, premium execution, and adaptive scoring. |
| Real local provider calls | Deferred | Threat boundary and config checks deny calls | Requires future PRD and provider-specific safety decision. |
| Direct subscription-agent process launch | Deferred | Launch stub is disabled | Requires process lifecycle, workspace policy, approval, cancellation, and secret/session handling. |
| Premium execution | Deferred | Approval request artifacts only | Requires premium provider boundary and explicit approval policy. |
| Adaptive scoring | Deferred | Outcome evidence exists but corpus is small | Use reporting first; scoring waits for enough audited outcomes. |

## Current Gap Interpretation

The architecture gap has moved from missing execution-attempt primitives to missing enablement governance.

The highest-value next work should:

1. Update architecture docs so they no longer route agents toward completed Story 2.1 work.
2. Add a dependency graph for deferred execution authority.
3. Formalize dashboard read/command/approval boundaries.
4. Formalize provider enablement precedence across PRDs, settings, registry, dashboard, and tests.
5. Improve operator reporting around existing attempt and runtime evidence.
6. Only then design the next controlled worker execution capability.

## Recommended Next Backlog

1. **Architecture Authority Dependency Graph**: document prerequisites for local provider calls, subscription-agent launch, premium execution, command execution, and adaptive scoring.
2. **Dashboard Command Boundary Contract**: classify read-only surfaces, record-only commands, approval-bearing commands, and disabled execution controls.
3. **Provider Enablement Policy**: define the exact checks required before any provider can move from capable/disabled to executable.
4. **Attempt Evidence Reporting Polish**: add a compact operator report or dashboard summary that highlights current attempts, disabled reasons, and next safe action.
5. **Outcome Evidence Expansion**: extend guarded utility outcome reporting before using it for adaptive routing.

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
