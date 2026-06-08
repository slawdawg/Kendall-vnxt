---
title: "PRD: Kendall_vNxt Supervisor Dynamic Routing MVP 1"
status: draft
created: 2026-06-08
updated: 2026-06-08
source_brainstorm: "_bmad-output/brainstorming/brainstorming-session-2026-06-07-194145.md"
---

# PRD: Kendall_vNxt Supervisor Dynamic Routing MVP 1

## 1. Summary

Kendall_vNxt supervisor dynamic routing extends the existing supervisor with a lane-centered routing policy simulator. The supervisor will classify managed work steps, select the safest appropriate execution lane, record why that route was chosen, and expose the decision to the operator before routing controls real worker execution.

MVP 1 does not launch new utility, local AI, subscription, or premium workers. It establishes the durable routing contract, deterministic dry-run behavior, workflow event visibility, and dashboard explanation surface needed before execution authority is expanded.

## 2. Problem

The existing supervisor is moving toward supervisor-owned execution, but worker selection is not yet modeled as an explicit, inspectable policy decision. Without a routing contract, future support for utility scripts, local model servers, subscription agents, and premium models risks becoming scattered provider-specific logic.

Kendall_vNxt needs a base-first routing layer that can answer:

- What kind of work is this step?
- Which execution lanes are eligible?
- Which lane is selected, and why?
- Which lanes were rejected, and why?
- How confident is the router?
- What authority mode applies?
- What would trigger escalation?
- What should the operator see before trusting the route?

## 3. Goals

- Establish a lane-centered routing contract inside the existing supervisor.
- Make routing decisions deterministic, testable, and replayable.
- Record routing decisions as workflow events.
- Expose routing decisions in the existing dashboard work-item detail flow.
- Provide a dry-run endpoint for route preview without changing execution behavior.
- Preserve current execution behavior during MVP 1.

## 4. Non-Goals

- Directly spawning Codex, Claude, Gemini, Ollama, LM Studio, vLLM, or llama.cpp workers.
- Running local AI inference.
- Running utility commands through a newly routed worker lane.
- Building a full worker fleet dashboard.
- Implementing adaptive routing or performance-based learning.
- Adding premium model execution or approval flows beyond route metadata.

## 5. Users And Stakeholders

Primary user: the Kendall_vNxt operator managing work through the existing dashboard.

System stakeholders:

- Supervisor service: owns routing policy, workflow events, and route previews.
- Dashboard: displays route state and explanations.
- Future workers: utility, local AI, subscription agent, and premium approval lanes.
- Future reviewers: inspect route decisions for safety, policy, and implementation readiness.

## 6. Product Principles

- Policy first, adapters later.
- Capability is not permission.
- Local is private, not automatically safe.
- Make the decision visible before making it powerful.
- Route lanes first, workers second.
- Keep deterministic checks and evidence collection separate from LLM reasoning.
- Preserve premium attention for work that justifies it.

## 7. Core Concepts

### 7.1 RoutingProfile

Describes the work before worker or lane selection.

Initial fields:

- `workItemId`
- `stepId`
- `taskKind`
- `phase`
- `riskLevel`
- `privacyLevel`
- `writeScope`
- `allowedPaths`
- `contextNeed`
- `reasoningNeed`
- `determinismNeed`
- `validationExpectations`
- `preferredLanes`
- `forbiddenLanes`
- `escalationTriggers`

### 7.2 ExecutionLane

Describes policy-level execution lanes. MVP 1 defines lane vocabulary only.

Initial lanes:

- `utility`
- `local_readonly`
- `local_patch_draft`
- `local_sandbox_execute`
- `subscription_handoff`
- `subscription_agent`
- `premium_approval`

### 7.3 RoutingDecision

Records the selected lane and why it was chosen.

Initial fields:

- `decisionId`
- `workItemId`
- `stepId`
- `profileSnapshot`
- `selectedLane`
- `selectedWorkerId`, optional and normally null in MVP 1
- `authorityMode`
- `confidenceScore`
- `confidenceBand`
- `reasonCodes`
- `rejectedLanes`
- `rejectedWorkers`, optional
- `permissionSummary`
- `escalationPath`
- `humanExplanation`
- `createdAt`

### 7.4 Authority Modes

- `record_only`: route is computed and recorded, but cannot affect execution.
- `advisory`: route is recommended and visible, but operator or existing flow remains in control.
- `guarded`: route can control limited behavior only when required gates pass.
- `authoritative`: route is enforced by supervisor policy.

MVP 1 supports `record_only` and `advisory`. Other modes may be defined as enum values but must not control execution yet.

### 7.5 Reason And Rejection Codes

Routing decisions must include stable machine-readable codes in addition to dashboard prose.

Example reason codes:

- `task.analysis_only`
- `task.deterministic_check`
- `permissions.no_file_write_required`
- `permissions.command_execution_required`
- `privacy.local_preferred`
- `usage.subscription_pressure_high`
- `quality.local_sufficient`
- `policy.premium_requires_approval`

Example rejection codes:

- `capability.language_synthesis_required`
- `capability.command_execution_required`
- `permission.file_write_not_allowed`
- `privacy.cloud_not_approved`
- `context.exceeds_lane_limit`
- `cost.risk_not_high_enough`
- `policy.disabled_for_mvp`

## 8. Functional Requirements

### Routing Contract

FR-1. The supervisor must define shared routing domain types for `RoutingProfile`, `ExecutionLane`, and `RoutingDecision`.

FR-2. The supervisor must define the initial execution lane vocabulary: `utility`, `local_readonly`, `local_patch_draft`, `local_sandbox_execute`, `subscription_handoff`, `subscription_agent`, and `premium_approval`.

FR-3. The supervisor must define authority modes: `record_only`, `advisory`, `guarded`, and `authoritative`.

FR-4. MVP 1 must not allow routing authority modes to change real execution behavior.

FR-5. The supervisor must define stable reason and rejection code vocabularies for routing decisions.

### Route Preview

FR-6. The supervisor must provide a deterministic route preview service that accepts or derives a `RoutingProfile` for a managed work-item step.

FR-7. The route preview service must return a `RoutingDecision` containing selected lane, confidence, authority mode, reason codes, rejected lanes, permission summary, escalation path, and human explanation.

FR-8. The route preview service must reject or mark unavailable any lane that fails policy, permission, privacy, or required-capability checks before scoring.

FR-9. The route preview service must be deterministic for the same input profile and configuration.

FR-10. The route preview service must default MVP-disabled lanes to rejected with `policy.disabled_for_mvp` unless explicitly supported in later slices.

### API

FR-11. The supervisor must expose a dry-run endpoint for route preview without changing execution state.

FR-12. The dry-run endpoint must support previewing a route for a work item and step identifier.

FR-13. The dry-run response must include both the `RoutingProfile` snapshot and the resulting `RoutingDecision`.

FR-14. The dry-run endpoint must not enqueue work, spawn workers, run commands, alter workflow state, or mutate delivery state.

### Workflow Events

FR-15. The supervisor must be able to record routing decisions as workflow events.

FR-16. Routing workflow events must include selected lane, authority mode, confidence, reason codes, rejected lanes, and escalation path.

FR-17. Routing workflow events must appear in the same work-item history and audit flow used by existing supervisor-managed gates and actions.

FR-18. MVP 1 may record routing events only when the operator explicitly requests a dry-run or when an existing managed action calls the route preview service. [ASSUMPTION]

### Dashboard

FR-19. The dashboard work-item detail page must show a compact routing badge when routing decision data is available.

FR-20. The routing badge must show selected lane, authority mode, and confidence band.

FR-21. The dashboard must provide a "Why This Route?" panel or expansion for a routing decision.

FR-22. The "Why This Route?" view must show plain-English rationale, reason codes rendered as readable text, rejected lanes, permission summary, escalation path, and whether execution is affected.

FR-23. MVP 1 dashboard UX must not introduce a full worker fleet dashboard.

### Testing And Verification

FR-24. Supervisor integration tests must cover deterministic route preview for representative task kinds.

FR-25. Supervisor integration tests must verify that dry-run routing does not mutate execution state.

FR-26. Supervisor integration tests must verify reason and rejection code output for at least one selected lane and one rejected lane.

FR-27. Dashboard tests must verify that the routing badge and "Why This Route?" view render from supervisor data.

FR-28. Existing supervisor and dashboard checks must remain green.

## 9. Initial Task Kind Vocabulary

MVP 1 should define this vocabulary, but only needs deterministic preview behavior for the subset used in tests.

- `repo_inventory`
- `task_classification`
- `routing_preview`
- `validation_execution`
- `validation_failure_analysis`
- `path_scope_check`
- `delivery_package_check`
- `evidence_summary`
- `bounded_recipe_implementation`
- `simple_patch_draft`
- `multi_file_implementation`
- `architecture_review`
- `security_review`
- `final_validation_review`
- `subscription_handoff_package`

## 10. Recommended Default Routing Behavior For MVP 1

- Deterministic checks prefer `utility`, but remain preview-only.
- Evidence explanation prefers `local_readonly`, but remains preview-only.
- Patch drafting uses `local_patch_draft` only as a preview lane and is disabled for execution.
- Bounded implementation should normally preview `subscription_handoff` or current supervisor execution path, depending on risk and step phase. [ASSUMPTION]
- Direct subscription agent and premium approval lanes are rejected or approval-gated in MVP 1.
- Local sandbox execution is rejected with `policy.disabled_for_mvp`.

## 11. Non-Functional Requirements

NFR-1. Route preview must be deterministic and suitable for integration testing.

NFR-2. Routing data must be serializable through existing supervisor API envelope conventions. [ASSUMPTION]

NFR-3. Dashboard rendering must remain compact and not add a new top-level navigation item in MVP 1.

NFR-4. Route decisions must not expose secrets or raw sensitive prompt content.

NFR-5. Route decisions must preserve enough context for audit without requiring full logs in dashboard payloads.

NFR-6. The implementation must not require Ollama, LM Studio, vLLM, llama.cpp, Codex, Claude, Gemini, Antigravity, or premium cloud credentials.

## 12. Success Metrics

- A representative work item can produce a deterministic route preview.
- Routing preview appears in the dashboard detail surface with understandable explanation.
- Integration tests prove dry-run routing does not mutate execution state.
- Reason and rejection codes are stable enough for tests to assert.
- Existing check suite remains green.

Counter-metrics:

- Dashboard adds routing UI that cannot be traced back to supervisor data.
- Routing preview depends on a live model or provider.
- Route decisions affect execution before explicit later approval.
- The routing contract becomes provider-specific before lane policy is stable.

## 13. Open Questions

OQ-1. Should dry-run route previews be recorded as workflow events by default, or only when explicitly saved?

OQ-2. Which existing managed step should be the first source of real route preview data: recipe gate audit, managed next action, validation failure, or delivery readiness?

OQ-3. Should `RoutingProfile` live only in supervisor service types initially, or also be exported through `packages/contracts` in MVP 1?

OQ-4. What is the minimum confidence scoring model for MVP 1: fixed by task kind, weighted deterministic score, or rule-derived band only?

OQ-5. Should operator override controls be visible in MVP 1 if routing is preview-only, or deferred until advisory routing can influence behavior?

## 14. Recommended Delivery Slices

### Slice 1: Routing Contract And Preview Service

- Add routing domain types.
- Add lane and authority vocabularies.
- Add reason and rejection codes.
- Add deterministic preview service.
- Add supervisor tests for route preview.

### Slice 2: Dry-Run API And Workflow Event Shape

- Add dry-run endpoint.
- Return profile and decision payloads.
- Add optional workflow event recording.
- Add integration tests for non-mutation.

### Slice 3: Dashboard Routing Badge

- Add routing badge to work-item detail page.
- Add "Why This Route?" panel.
- Add dashboard browser coverage.

### Slice 4: MVP Hardening

- Add more representative task kinds.
- Tighten reason code vocabulary.
- Verify existing check suite.
- Prepare follow-on implementation story for utility worker routing.

## 15. Future Work

- Authoritatively route deterministic utility work.
- Add local read-only evidence explanation.
- Add structured subscription handoff packages.
- Add worker performance profiles from attempt evidence.
- Add operator override evidence and tuning.
- Add fleet dashboard only after routing decisions exist across enough work items.
- Consider direct subscription-agent launch after handoff quality and safety boundaries are proven.
