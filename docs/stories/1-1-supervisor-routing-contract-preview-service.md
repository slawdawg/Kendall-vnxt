---
baseline_commit: 55c24f09a58bb5ec968ec1d487f03d84b1b77022
---
# Story 1.1: Supervisor Routing Contract and Preview Service

Status: done

## Story

As a Kendall_vNxt operator,
I want the supervisor to compute deterministic route previews for managed work steps,
so that routing policy can be inspected and tested before it controls real workers.

## Acceptance Criteria

1. Supervisor routing domain vocabulary exists for `RoutingProfile`, `ExecutionLane`, `RoutingDecision`, authority modes, reason codes, and rejection codes.
2. Initial execution lanes are defined as `utility`, `local_readonly`, `local_patch_draft`, `local_sandbox_execute`, `subscription_handoff`, `subscription_agent`, and `premium_approval`.
3. MVP authority modes include `record_only`, `advisory`, `guarded`, and `authoritative`, but the preview service only returns non-executing modes and must not change execution behavior.
4. A deterministic backend preview service accepts or derives a routing profile for a work item step and returns selected lane, confidence score or band, authority mode, reason codes, rejected lanes, permission summary, escalation path, and human explanation.
5. Unsupported or MVP-disabled lanes are rejected with stable rejection codes, including `policy.disabled_for_mvp` where applicable.
6. The preview service is deterministic for identical profile input and configuration.
7. Supervisor tests cover representative route previews, selected lane reasons, rejected lane reasons, and the guarantee that route preview does not mutate work-item state, delivery state, or workflow state.
8. No worker adapters, model calls, command execution, local AI server calls, subscription CLI launches, premium approval flows, or dashboard fleet views are introduced in this story.

## Tasks / Subtasks

- [x] Define routing domain vocabulary in the supervisor domain layer. (AC: 1, 2, 3, 5)
  - [x] Add a routing-focused domain module, recommended path: `services/supervisor/src/supervisor/domain/routing.py`.
  - [x] Use `StrEnum` for stable serialized vocabularies, matching the existing style in `supervisor.domain.types`.
  - [x] Define lane, authority mode, task kind, risk/privacy/write-scope/context/reasoning/determinism vocabularies only as needed for deterministic MVP preview.
  - [x] Define dataclass or Pydantic-compatible structures for `RoutingProfile`, `RejectedLane`, and `RoutingDecision`; keep them serializable without database schema changes.

- [x] Implement a deterministic route preview service. (AC: 3, 4, 5, 6, 8)
  - [x] Add a pure service/helper, recommended path: `services/supervisor/src/supervisor/domain/routing.py` or `services/supervisor/src/supervisor/application/routing.py` if application state is needed.
  - [x] Prefer a pure function/class such as `RoutingPreviewService.preview(profile) -> RoutingDecision` so tests do not need live worker infrastructure.
  - [x] Score lanes by rule, not by model call. Same input must produce the same selected lane, rejected lanes, confidence, and explanation.
  - [x] Ensure `guarded`, `authoritative`, direct worker execution, local model calls, and command execution are not used by MVP preview logic.
  - [x] Include selected and rejected lane reasons as stable machine-readable codes plus concise human explanation.

- [x] Add supervisor integration seam without changing runtime behavior. (AC: 3, 4, 7, 8)
  - [x] Add a `SupervisorService` method that can derive a profile for a managed work-item step, using existing work item metadata and recipe/audit context.
  - [x] Recommended first seam: recipe gate audit / next managed action, because the supervisor already derives policy gates and `nextManagedAction` there.
  - [x] Keep this story backend-only. Do not add dashboard rendering yet.
  - [x] Do not record route preview events automatically in this story unless the implementation also proves non-mutation behavior and keeps execution unaffected. Prefer returning preview data from a service method and leaving event persistence to the next story.

- [x] Add API schemas only if needed by the backend tests. (AC: 1, 4, 7)
  - [x] If adding a dry-run endpoint in this story, use existing `ApiEnvelope` conventions and place request/response models in `services/supervisor/src/supervisor/api/schemas.py`.
  - [x] If the endpoint is deferred, keep schemas internal and make the next story explicitly add `POST /work-items/{id}/routing-preview` or equivalent.
  - [x] Do not export routing types through `packages/contracts` in this story unless dashboard code is touched. This story should avoid TypeScript contract churn.

- [x] Add focused tests. (AC: 4, 5, 6, 7, 8)
  - [x] Extend `services/supervisor/tests/integration/test_supervisor_flow.py` or add a focused supervisor routing test module if the existing file becomes too large.
  - [x] Cover deterministic utility preference for deterministic checks such as path-scope or validation execution.
  - [x] Cover local read-only preview for evidence/explanation style work, with execution disabled.
  - [x] Cover subscription handoff preview for bounded implementation where quality/risk exceeds local preview lanes.
  - [x] Assert disabled lanes reject with `policy.disabled_for_mvp` or more specific rejection codes.
  - [x] Assert preview does not create workflow events, advance state, run recipe commands, mutate delivery readiness, or alter branch metadata.

### Review Findings

- [x] [Review][Patch] Preview can run remote preflight commands while deriving next managed action [services/supervisor/src/supervisor/application/service.py:2428]
- [x] [Review][Patch] Forbidden lanes can still be selected by task-kind routing [services/supervisor/src/supervisor/domain/routing.py:99]
- [x] [Review][Patch] Rejected lane list omits some non-selected alternatives [services/supervisor/src/supervisor/domain/routing.py:162]
- [x] [Review][Patch] Delivery and final-review task kinds fall through to generic low-confidence routing [services/supervisor/src/supervisor/domain/routing.py:121]
- [x] [Review][Patch] Missing-work-item routing preview returns misleading preview-not-found error [services/supervisor/src/supervisor/api/main.py:120]
- [x] [Review][Defer] CORS regex configuration needs separate security/startup review [services/supervisor/src/supervisor/api/main.py:50] -- deferred, pre-existing
## Dev Notes

### Product Context

This is part of the existing Kendall_vNxt supervisor, not a separate Bob Supervisor product. The goal is dynamic routing inside the current supervisor: route lanes first, workers second. MVP 1 is a policy simulator and must not launch or control Codex, Claude, Gemini/Antigravity, Ollama, LM Studio, vLLM, llama.cpp, utility scripts, or premium cloud workers. [Source: docs/prds/supervisor-dynamic-routing-mvp-1.md]

The PRD's first delivery slice is `Routing Contract And Preview Service`: add routing domain types, lane and authority vocabularies, reason/rejection codes, deterministic preview service, and supervisor tests. Dashboard routing badge, dry-run API workflow events, and fleet dashboard are later slices unless explicitly pulled forward. [Source: docs/prds/supervisor-dynamic-routing-mvp-1.md]

### Current Architecture

The repo is split into `apps/dashboard` for the operator control plane, `services/supervisor` for orchestration and workflow state, `packages/contracts` for shared transport vocabulary, and `packages/workflow-core` for workflow semantics. The supervisor owns workflow transitions, retry, audit routing, assignment, escalation, saved views, event history, recipes, policy gates, delivery readiness, and managed next actions. [Source: docs/implementation-checkpoint-2026-06-06.md]

The current planning direction is to increase supervisor-owned execution capability while keeping dashboard work supportive. Routing should attach to existing supervisor execution policy surfaces rather than create a new orchestrator. [Source: docs/implementation-checkpoint-2026-06-06.md]

### Existing Code To Reuse

- `services/supervisor/src/supervisor/domain/types.py` already defines `StrEnum` vocabularies for workflow state, lanes, run modes, risk levels, audit modes, filter scopes, workflow actions, and error categories. Match this style for routing enums.
- `services/supervisor/src/supervisor/domain/recipes.py` defines immutable dataclasses for recipes, gates, commands, and remote automation policy. Routing profile/decision objects can follow this domain style when API validation is not required.
- `services/supervisor/src/supervisor/api/schemas.py` contains Pydantic response/request models and `ApiEnvelope`. Add transport schemas here only if this story exposes a backend endpoint.
- `services/supervisor/src/supervisor/api/main.py` groups work-item endpoints by resource path and delegates to `SupervisorService`.
- `services/supervisor/src/supervisor/application/service.py` is the current orchestration service. It already derives recipe gate audits and managed next actions through `_recipe_gate_audit_view`, `_recipe_gate_audit_entry`, and `_next_managed_action_view`.
- `services/supervisor/tests/integration/test_supervisor_flow.py` is the established integration test surface for supervisor work-item, recipe, gate, managed-action, and remote-delivery behavior.

### Implementation Guardrails

- Do not add new dependencies. Use Python standard library, existing dataclasses, existing Pydantic, and existing pytest/FastAPI test patterns.
- Do not change database schema for MVP 1 preview. Route decisions can be derived and serialized in memory.
- Do not make routing provider-specific. `local_ollama`, `codex`, `claude`, etc. are future worker/provider adapters beneath lanes, not MVP routing lanes.
- Do not let preview alter execution. No calls to recipe command runners, branch prep, delivery executor, worker poller, or subprocess code.
- Keep confidence deterministic. A simple rule-derived band such as `high`, `medium`, `low` is acceptable if scores would add fake precision.
- Keep reason and rejection codes stable and testable; dashboard prose can be derived later.
- Treat local workers as private but not automatically safe. Local execution lanes that imply writes or commands should be disabled or rejected in this story.
- Preserve existing behavior for recipe gate audit, managed next action, delivery readiness, workflow events, and action transitions.

### Suggested Routing Defaults For Tests

Use representative deterministic behavior from the PRD:

- `path_scope_check`, `validation_execution`, or `repo_inventory` should select `utility` in `record_only` or `advisory` mode with reasons like `task.deterministic_check` and `permissions.no_language_synthesis_required`.
- `evidence_summary` or `validation_failure_analysis` should select `local_readonly` in preview mode with reasons like `privacy.local_preferred` and `permissions.read_only_required`.
- `bounded_recipe_implementation` or `multi_file_implementation` should avoid direct local execution and prefer `subscription_handoff` in preview mode with reasons like `quality.subscription_handoff_preferred`.
- `local_sandbox_execute`, `subscription_agent`, and `premium_approval` should be rejected in MVP 1 unless the profile explicitly needs their future capability, and even then they must not execute.

### File Structure Notes

Expected new or touched backend files:

- `services/supervisor/src/supervisor/domain/routing.py` - new routing vocabulary and pure preview logic.
- `services/supervisor/src/supervisor/application/service.py` - update only if deriving profile/preview from work items or recipe gate audit context.
- `services/supervisor/src/supervisor/api/schemas.py` - update only if exposing transport schema in this story.
- `services/supervisor/src/supervisor/api/main.py` - update only if exposing a dry-run endpoint in this story.
- `services/supervisor/tests/integration/test_supervisor_flow.py` or a new routing test file under `services/supervisor/tests/integration/` - required tests.

Avoid touching dashboard files, `packages/contracts`, worker adapters, local model configuration, or runtime settings in this story unless tests prove a backend API contract must be shared now.

### Verification

Minimum verification for this story:

- `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q`
- If a new test file is added, run the whole supervisor test suite with `pnpm run test:supervisor` or `uv run --directory services/supervisor pytest`.
- Run `git diff --check` before handoff.

Full repo verification is encouraged when the API surface changes:

- `pnpm run check`

### Open Questions Resolved For This Story

- OQ-1: Do not record dry-run previews as workflow events by default in this first story. Keep event persistence for a later API/workflow-event story.
- OQ-2: Use recipe gate audit / next managed action as the first integration seam.
- OQ-3: Keep routing types in the Python supervisor service for Story 1.1. Export through `packages/contracts` only when dashboard/API transport needs it.
- OQ-4: Use deterministic rule-derived confidence bands first; avoid false precision.
- OQ-5: Defer operator override controls until routing can influence behavior.

### References

- [Source: docs/prds/supervisor-dynamic-routing-mvp-1.md]
- [Source: docs/prds/supervisor-dynamic-routing-mvp-1-decision-log.md]
- [Source: docs/implementation-checkpoint-2026-06-06.md]
- [Source: docs/environment-recovery-and-runtime-boundary.md]
- [Source: services/supervisor/src/supervisor/domain/types.py]
- [Source: services/supervisor/src/supervisor/domain/recipes.py]
- [Source: services/supervisor/src/supervisor/application/service.py]
- [Source: services/supervisor/src/supervisor/api/schemas.py]
- [Source: services/supervisor/src/supervisor/api/main.py]
- [Source: services/supervisor/tests/integration/test_supervisor_flow.py]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Added a supervisor-only routing domain module with lane, authority, task-kind, profile, rejection, and decision vocabulary.
- Implemented deterministic preview rules for utility, local read-only, and subscription handoff lanes without worker execution authority.
- Added a read-only supervisor service/API seam that derives a routing profile from the existing recipe gate audit / next managed action path and returns preview data without persistence or workflow mutation.
- Added focused routing tests for deterministic output, representative lane choices, disabled-lane rejection, and non-mutation behavior.

### Debug Log References

- Red test: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` failed with missing `supervisor.domain.routing` and missing `routing-preview` endpoint.
- Focused green: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 4 tests.
- Regression: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q` passed, 36 tests.
- Configured supervisor test: `pnpm run test:supervisor` passed, 36 tests, 1 aiosqlite deprecation warning.
- Full check: `pnpm run check` passed, including preflight, dashboard build, and supervisor tests.
- Diff hygiene: `git diff --check` passed after BOM/EOF cleanup.

### Completion Notes List

- Implemented the routing contract and deterministic route preview service in the supervisor domain layer.
- Added read-only routing preview API support at GET /work-items/{work_item_id}/routing-preview using existing ApiEnvelope conventions.
- Routed previews from existing recipe gate audit / next managed action context without recording events, running commands, changing workflow state, or touching delivery state.
- Added focused integration tests covering representative lane selection, stable rejection codes, deterministic repeatability, and non-mutation behavior.

### File List

- services/supervisor/src/supervisor/domain/routing.py
- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- _bmad-output/implementation-artifacts/1-1-supervisor-routing-contract-preview-service.md
- docs/stories/1-1-supervisor-routing-contract-preview-service.md

- Resolved all code review patch findings: preview-only remote preflight guard, forbidden-lane fallback, complete rejected-lane output, explicit delivery/final-review routing, and missing-work-item API error.

## Change Log

- 2026-06-08: Implemented Story 1.1 routing contract and preview service; status moved to review.
- 2026-06-08: Applied code review patches and moved story status to done.
