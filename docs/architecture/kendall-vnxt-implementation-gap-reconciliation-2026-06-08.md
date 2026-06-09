# Kendall_vNxt Implementation Gap Reconciliation

Date: 2026-06-08
Updated: 2026-06-08 after Story 2.8 and connector workflow polish
Scope: Code-aware reconciliation of architecture and PRD gaps against current implementation

Source review artifacts:

- `docs/architecture/index.md`
- `docs/architecture/kendall-vnxt-overall-architecture.md`
- `docs/architecture/kendall-vnxt-architecture-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/prds/index.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/index.md`
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
| Process lifecycle design | Documented | `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`, Story 3.9 | Defines future process supervisor, lifecycle, workspace, output, session, approval, rollback, and stop-line requirements. |
| Runtime evidence export readiness references | Implemented | `RuntimeEvidenceExportBoundaryView.relatedSupervisorReports`, Story 3.9 | Work-item exports now point to readiness, boundary, disabled provider proof, config, and threat reports. |
| Provider disabled adapter fixture expansion | Implemented | `docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md`, provider proof contract, Story 3.10 | Provider proofs now include endpoint family, redaction, timeout, cancellation, and retention policy fields. |
| First local provider PRD draft | Documented | `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`, Story 3.10 | Drafts Ollama gates, endpoint policy, prompt/retention policy, future acceptance criteria, rollback, and open questions without approving implementation. |
| Ollama PRD review and story breakdown | Documented | `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`, Stories 4.1-4.4 | Resolves planning questions and creates blocked implementation stories pending explicit approval. |
| Runtime evidence export dashboard access | Implemented | `RuntimeEvidenceExportPanel`, Story 3.11 | Work-item detail pages show export summary, safety flags, related reports, and git-backed boundary evidence. |
| Runtime evidence report anchor links | Implemented | `RuntimeEvidenceExportPanel`, Story 3.40 | Runtime export related report entries link to the same stable controls-page report anchors used by evidence overview shortcuts. |
| Runtime evidence review manifest | Implemented | `RuntimeEvidenceExportView.reviewManifest`, Story 3.20 | Adds export counts, checklist, retention notes, and stop lines without changing approval state. |
| Runtime evidence review navigator | Implemented | `RuntimeEvidenceExportView.reviewNavigator`, Story 3.30 | Adds prioritized runtime state, authority boundary, and git-backed evidence review shortcuts without changing approval state. |
| Runtime evidence export drift check | Implemented | `pnpm run check:runtime-export`, Story 3.31 | Keeps runtime export contracts, schemas, service navigator items, dashboard rendering, browser assertions, and story evidence aligned. |
| Safe development backlog drift check | Implemented | `pnpm run check:safe-backlog`, Story 3.32 | Keeps safe backlog contracts, schemas, API route, service items, dashboard rendering, browser assertions, blocked authority stop lines, and story evidence aligned. |
| Subscription-agent launch PRD | Documented | `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`, Story 3.12 | Drafts supervised launch gates, lifecycle, workspace, output, session, dashboard, runtime export, rollback, and open questions without approving implementation. |
| Subscription-agent launch PRD review and story breakdown | Documented | `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`, Stories 5.1-5.5 | Resolves planning questions and creates blocked implementation stories pending explicit approval. |
| Execution authority approval checkpoints | Documented | `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`, Story 3.13 | Defines approval language, non-approval language, evidence requirements, and currently blocked authority stories. |
| Dashboard evidence overview polish | Implemented | `EvidenceOverviewPanel`, Story 3.14 | Work-item detail pages show read-only shortcuts and summaries for routing, attempts, exports, and history. |
| Evidence overview review shortcuts | Implemented | `EvidenceOverviewPanel`, Story 3.33 | Surfaces runtime export review navigator items at the top of work-item detail without adding execution controls. |
| Evidence overview report shortcuts | Implemented | `EvidenceOverviewPanel`, Story 3.34 | Surfaces runtime export related supervisor reports and controls-catalog navigation without adding execution controls. |
| Evidence overview report anchor shortcuts | Implemented | `EvidenceOverviewPanel`, Story 3.39 | Links runtime-export related supervisor reports to stable controls-page report anchors for faster read-only review. |
| Documentation authority report | Implemented | `GET /supervisor/documentation-authority-report`, `DocumentationAuthorityReportPanel`, Story 3.15 | Surfaces architecture, PRD, story, approval checkpoint, blocked-story, and drift-check status without changing approval state. |
| Verification readiness report | Implemented | `GET /supervisor/verification-readiness-report`, `VerificationReadinessReportPanel`, Story 3.16 | Surfaces required checks, optional checks, and authority stop lines without changing approval state. |
| Dashboard e2e reliability guardrails | Implemented | `playwright.config.ts`, `pnpm run test:e2e:dashboard:controls`, Story 3.17 | Keeps Playwright web-server cache paths repo-local and adds a focused controls-page browser verification command. |
| Dashboard detail e2e runner | Implemented | `pnpm run test:e2e:dashboard:detail`, Story 3.21 | Adds an owned-lifecycle work-item detail browser verification command for runtime export changes. |
| Dashboard e2e report | Implemented | `GET /supervisor/dashboard-e2e-report`, `DashboardE2EReportPanel`, Story 3.22 | Maps focused/full browser runners, setup commands, lifecycle posture, cache posture, and authority stop lines. |
| Dashboard e2e lifecycle helper | Implemented | `scripts/dashboard-e2e-runner.mjs`, Story 3.23 | Centralizes focused browser runner server lifecycle, repo-local cache posture, Playwright pass detection, and cleanup. |
| Dashboard mobile e2e runner | Implemented | `pnpm run test:e2e:dashboard:mobile`, Story 3.24 | Adds an owned-lifecycle focused mobile intake draft verification command through the shared runner helper. |
| Managed recipe e2e runners | Implemented | `pnpm run test:e2e:dashboard:managed`, `pnpm run test:e2e:dashboard:managed:mobile`, Story 3.25 | Adds owned-lifecycle focused checks for dashboard and mobile managed coverage intake templates. |
| Managed recipe policy report | Implemented | `GET /supervisor/managed-recipe-policy-report`, Story 3.36 | Surfaces managed recipe gates, allowed paths, commands, checkpoints, and blocked remote automation posture without granting execution authority. |
| Managed recipe policy drift check | Implemented | `pnpm run check:managed-recipes`, Story 3.37 | Keeps managed recipe policy contracts, schemas, API route, service construction, dashboard rendering, browser assertions, tests, and story evidence aligned. |
| Dashboard e2e report drift check | Implemented | `pnpm run check:e2e-report`, `scripts/run-supervisor-tests.mjs`, Story 3.26 | Keeps package scripts, supervisor reports, browser assertions, story references, and repo-local supervisor test cache posture aligned for verification changes. |
| Safe development backlog report | Implemented | `GET /supervisor/safe-development-backlog`, `SafeDevelopmentBacklogPanel`, Story 3.27 | Prioritizes larger safe maintenance/report/verification slices while keeping execution-authority work blocked. |
| Supervisor report catalog drift check | Implemented | `pnpm run check:reports`, Story 3.28 | Keeps report catalog entries, API routes, runtime export references, dashboard fetches, browser assertions, and story evidence aligned. |
| Runbook verification alignment | Implemented | `pnpm run check:runbooks`, Story 3.29 | Keeps README, fresh VM checklist, bootstrap guide, and current handoff language aligned with the active verification chain. |
| Runbook check-chain hardening | Implemented | `pnpm run check:runbooks`, Story 3.35 | Requires current operator runbooks to name runtime export and safe backlog drift checks in the active verification chain. |
| Runbook managed recipe check-chain alignment | Implemented | `pnpm run check:runbooks`, Story 3.38 | Requires current operator runbooks and handoffs to name managed recipe policy drift checks after `check:managed-recipes` entered the full verification chain. |
| Current gap review refresh | Implemented | `pnpm run check:docs`, Story 3.41 | Keeps the current gap review and continuation handoff aligned with the Story 3.40 safe-work state and larger coherent safe-slice guidance. |
| Supervisor report catalog | Implemented | `GET /supervisor/report-catalog`, `SupervisorReportCatalogPanel`, Story 3.18 | Indexes read-only supervisor evidence reports and stop lines without changing approval state. |
| Maintenance readiness report | Implemented | `GET /supervisor/maintenance-readiness-report`, `MaintenanceReadinessReportPanel`, Story 3.19 | Tracks safe maintenance lanes, report alignment, and blocked authority posture without changing approval state. |
| Real local provider calls | Deferred | Threat boundary and config checks deny calls | Requires future PRD and provider-specific safety decision. |
| Direct subscription-agent process launch | Deferred | Launch stub is disabled | Requires process lifecycle, workspace policy, approval, cancellation, and secret/session handling. |
| Premium execution | Deferred | Approval request artifacts only | Requires premium provider boundary and explicit approval policy. |
| Adaptive scoring | Deferred | Outcome evidence exists but corpus is small | Use reporting first; scoring waits for enough audited outcomes. |

## Current Gap Interpretation

The architecture gap has moved from missing execution-attempt primitives to missing enablement governance.

The highest-value next work should:

1. Keep architecture docs aligned with the implemented non-executing control plane.
2. Continue maintenance and hygiene while waiting for explicit execution-authority approval.
3. Wait for explicit approval before moving any Ollama or launch story from blocked to ready.
4. Use execution-readiness reports to decide when a provider-specific PRD has enough evidence.
5. Only then implement the next controlled worker execution capability.

## Recommended Next Backlog

1. **Maintenance And Hygiene**: keep checks, docs, safe backlog items, and blocked-story state current.
2. **Provider Approval Checkpoint**: wait for explicit approval before implementing any Ollama execution story.
3. **Provider PRD Review Loop**: decide whether Ollama remains first or another local provider should be prioritized.
4. **Read-Only Evidence Polish**: add small review shortcuts only when useful.

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
