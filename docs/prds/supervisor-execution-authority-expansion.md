# PRD: Supervisor Execution Authority Expansion

Date: 2026-06-08
Status: draft baseline
Product area: Kendall_vNxt supervisor orchestration
Related architecture: `docs/architecture/kendall-vnxt-overall-architecture.md`
Gap source: `docs/architecture/kendall-vnxt-architecture-gap-review-2026-06-08.md`

## 1. Summary

Kendall_vNxt has a safe dynamic-routing foundation, but direct worker execution remains intentionally disabled beyond guarded deterministic utility work. This PRD defines the next bounded product phase: expanding supervisor execution authority without launching real subscription agents, local model providers, or premium providers yet.

The goal is to make the supervisor capable of representing, controlling, canceling, observing, and auditing execution attempts before it is allowed to start powerful external or local workers.

This PRD is not a generic "launch agents" plan. It is the safety and control layer required before that plan can exist.

## 2. Problem

The supervisor can route work, produce handoff and approval artifacts, and run narrow guarded utility actions. However, the architecture gap review found that execution authority cannot safely expand until these concepts are explicit:

- execution attempt state,
- worker lifecycle,
- cancellation and timeout behavior,
- workspace isolation and rollback boundaries,
- approval and stale-decision protection,
- event/evidence observability,
- disabled-default provider configuration,
- threat boundaries for commands, prompts, secrets, and local provider endpoints.

Without those controls, enabling real worker launch would risk duplicate dispatch, stale approvals, hidden background behavior, unbounded local file access, incomplete rollback, or provider calls that bypass governance intent.

## 3. Goals

1. Define supervisor-owned execution attempt state that can represent planned, running, canceled, failed, timed-out, and completed work.
2. Define a worker lifecycle contract for start, heartbeat, timeout, cancellation, completion, failure, artifact capture, and cleanup.
3. Define approval command rules that reject stale or route-mismatched approvals.
4. Define workspace isolation requirements before any worker can mutate source or produce patches.
5. Define observability requirements for execution attempts, including attempt IDs, route decision IDs, correlation IDs, event taxonomy, and evidence retention.
6. Define configuration defaults that keep direct subscription-agent launch, local provider calls, and premium execution disabled until explicitly enabled by later PRDs/stories.
7. Produce implementation-ready stories that increase control-plane authority without enabling real external worker execution.

## 4. Non-Goals

This PRD does not approve:

- launching Codex, Claude, Gemini, Antigravity, or other subscription-agent processes,
- contacting Ollama, LM Studio, vLLM, llama.cpp, or other local model servers,
- premium provider execution,
- background runtime assistant behavior outside explicit operator/supervisor workflows,
- destructive source mutation,
- customer, production, credential, or account/security access,
- adaptive routing/scoring changes.

Those remain deferred until follow-on PRDs or explicit safety decisions approve them.

## 5. Users And Stakeholders

- Operator: supervises work, reviews evidence, approves gated actions, and cancels unsafe or stale attempts.
- Developer/operator: uses the dashboard and repo artifacts to understand execution state and recover from failures.
- Supervisor service: owns execution state, events, policy enforcement, and worker lifecycle records.
- Worker adapters: future execution providers that must obey the common lifecycle and permission envelope.
- Governance coordinator: provides planning and safety decisions that constrain runtime authority.

## 6. Product Principles

- Capability is not permission.
- Disabled means technically unable to execute, not merely hidden in the UI.
- Every execution attempt must be addressable, cancelable, observable, and auditable.
- Approvals must bind to a specific route decision and become invalid when relevant state changes.
- Workspace mutation must be isolated before it is allowed.
- Recovery includes source and operational evidence, not just code.
- Add authority one rung at a time.

## 7. Core Concepts

### 7.1 ExecutionAttempt

A supervisor-owned record representing one attempt to perform work through an execution lane or worker adapter.

Required fields:

- `attemptId`
- `workItemId`
- `routeDecisionId`
- `workerId`
- `lane`
- `authorityMode`
- `status`
- `requestedBy`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `heartbeatAt`
- `timeoutAt`
- `cancelRequestedAt`
- `cancelReason`
- `failureReason`
- `artifactRefs`
- `eventRefs`

Initial status vocabulary:

- `planned`
- `approved`
- `starting`
- `running`
- `cancel_requested`
- `cancelled`
- `timed_out`
- `failed`
- `completed`
- `rejected`

### 7.2 WorkerLifecycle

The lifecycle contract every future worker adapter must support or explicitly decline.

Required lifecycle capabilities:

- estimate
- start or preview
- heartbeat
- cancel
- timeout handling
- completion reporting
- failure reporting
- artifact reporting
- cleanup reporting

Current phase requirement: lifecycle may be implemented with mock or disabled workers only. The contract must be testable without real external providers.

### 7.3 PermissionEnvelope

A per-attempt policy object describing what the worker may do.

Required fields:

- allowed lanes
- allowed worker IDs
- allowed paths
- forbidden paths
- allowed commands or command classes
- network permission
- model/provider permission
- mutation permission
- credential access permission
- maximum runtime
- required evidence
- approval requirements

### 7.4 WorkspaceIsolationPlan

A plan for where an attempt may read, write, and store artifacts.

Required fields:

- source snapshot strategy
- branch or copy strategy
- writable root
- artifact root
- secret exclusion rule
- cleanup rule
- rollback rule
- diff/patch capture rule

This PRD only requires the plan and contract. Real mutating workspace execution remains a later implementation phase.

### 7.5 ApprovalBinding

An approval must bind to specific current state.

Required binding fields:

- `workItemId`
- `routeDecisionId`
- `attemptId`, when applicable
- approving operator
- approval type
- approved authority mode
- expiration condition
- createdAt

Approvals must be rejected if the route decision, work item state, permission envelope, or worker target has changed since the approval was created.

## 8. Functional Requirements

### Execution Attempt State

FR-1. The supervisor must expose an execution attempt contract in shared API vocabulary.

FR-2. The supervisor must be able to create a non-executing planned attempt for an eligible work item and route decision.

FR-3. The supervisor must reject attempt creation when no current route decision exists.

FR-4. The supervisor must reject attempt creation when the selected lane is disabled for real execution.

FR-5. The supervisor must preserve one active execution attempt per work item unless a future policy explicitly allows parallel attempts.

FR-6. The supervisor must record attempt status changes as workflow events.

FR-7. The supervisor must expose attempt history for a work item.

### Lifecycle And Cancellation

FR-8. The supervisor must define lifecycle transitions for planned, approved, starting, running, cancel requested, canceled, timed out, failed, completed, and rejected attempts.

FR-9. The supervisor must reject invalid lifecycle transitions.

FR-10. The supervisor must support cancel-request recording for active attempts.

FR-11. The supervisor must record cancellation reason, requested operator, and timestamp.

FR-12. The supervisor must support timeout metadata on attempts even before real process timeout enforcement exists.

FR-13. The supervisor must record heartbeat timestamps for lifecycle-capable workers.

FR-14. Disabled or mock workers must be able to demonstrate lifecycle behavior without launching real processes.

### Approval And Stale Decision Protection

FR-15. Approval commands must include the current `routeDecisionId`.

FR-16. The supervisor must reject approvals when the provided route decision is stale.

FR-17. The supervisor must reject approvals when the requested worker, lane, or authority mode differs from the route decision being approved.

FR-18. Approval artifacts must state what remains disabled after approval.

FR-19. Approval events must be linked to attempt IDs when an attempt exists.

### Workspace Isolation And Rollback Planning

FR-20. Every execution attempt must include a workspace isolation plan, even if execution is disabled.

FR-21. The isolation plan must identify read roots, write roots, artifact roots, forbidden paths, and cleanup rules.

FR-22. Mutating attempts must remain rejected until workspace isolation has implementation and verification coverage.

FR-23. Attempt artifacts must include enough path metadata for a reviewer to determine where outputs would land.

### Configuration And Disabled Defaults

FR-24. Direct subscription-agent launch must default to disabled.

FR-25. Direct local model/provider calls must default to disabled.

FR-26. Premium execution must default to disabled.

FR-27. Configuration must distinguish worker capability from permission to execute.

FR-28. Startup or health checks must expose disabled reasons for execution-capable providers.

FR-29. Tests must assert that disabled providers do not perform process launch, HTTP calls, or model calls.

### Observability And Evidence

FR-30. Execution attempt events must include `attemptId`, `workItemId`, `routeDecisionId`, `workerId`, and lane when applicable.

FR-31. Attempt events must use stable event names.

FR-32. The supervisor must expose attempt evidence suitable for dashboard display.

FR-33. The dashboard must distinguish planned, disabled, running, canceled, failed, timed out, and completed attempt states.

FR-34. Evidence must identify whether an outcome is code-backed, test-backed, doc-backed, or decision-backed.

FR-35. Attempt evidence must be recoverable from persisted supervisor state or durable exported artifacts.

### Threat And Safety Boundary

FR-36. Prompt/evidence packet construction must define a redaction boundary before real model calls are enabled.

FR-37. Command execution must remain allowlisted and disabled by default outside existing guarded utility actions.

FR-38. Network access for workers must remain denied unless explicitly allowed by a later provider-specific policy.

FR-39. Credential access must remain forbidden.

FR-40. The supervisor must record a rejection reason when any safety boundary blocks an attempt.

## 9. Non-Functional Requirements

NFR-1. Determinism: tests for this phase must run without live external providers, local model servers, or subscription CLI credentials.

NFR-2. Auditability: attempt state transitions must be reconstructable from supervisor state and events.

NFR-3. Recoverability: durable docs and contracts must live in Git; local runtime state must have a future export path identified before relying on it as sole evidence.

NFR-4. Security: no new code may read credentials, write secrets into prompts, or call provider endpoints in this phase.

NFR-5. Operator clarity: dashboard language must make disabled versus executable states obvious.

NFR-6. Backward compatibility: existing routing preview, handoff, premium approval, and disabled worker endpoints must continue to work.

## 10. Success Metrics

- All new execution attempt endpoints and contracts have focused integration tests.
- Existing `pnpm run check` continues to pass.
- Dashboard surfaces attempt state without implying real worker launch is enabled.
- Disabled worker tests prove no process launch, HTTP call, or model call occurs.
- Attempt lifecycle events include stable IDs and can be correlated to route decisions.
- First implementation slice produces no real provider side effects.

Counter-metrics:

- Any test requiring live Ollama, LM Studio, vLLM, llama.cpp, Codex, Claude, Gemini, or premium credentials indicates scope creep.
- Any implementation that starts a real process or provider call during this PRD phase is a failure.
- Any approval that is not bound to a route decision is unsafe.

## 11. UX Requirements

UX-1. Dashboard attempt displays must use clear status labels and disabled-state explanations.

UX-2. Approval controls must show the route decision being approved.

UX-3. Stale approval rejection must produce a plain explanation and suggest refreshing the work item state.

UX-4. Attempt history must be visible from the work-item detail surface or a closely linked evidence panel.

UX-5. Operator copy must not imply autonomous execution is available when the lane remains disabled.

## 12. Initial Delivery Slices

### Slice 1: Execution Attempt Contract And State Model

Create shared contracts and supervisor domain state for non-executing execution attempts. Include attempt creation rejection for disabled lanes and missing route decisions.

### Slice 2: Attempt Lifecycle Events And History API

Add stable workflow events and an attempt history endpoint. Support planned, rejected, cancel requested, canceled, timed out, failed, and completed states using mock/disabled workers only.

### Slice 3: Approval Binding And Stale Decision Rejection

Require route-decision-bound approvals for attempt-related actions. Reject stale or mismatched approvals.

### Slice 4: Workspace Isolation Plan Contract

Add a non-executing isolation-plan contract to attempts. Keep mutating attempts rejected until implementation coverage exists.

### Slice 5: Dashboard Attempt Evidence Panel

Surface attempt state, disabled reasons, route binding, cancellation state, and evidence classification in the dashboard.

### Slice 6: Disabled Execution Configuration Checks

Add config/startup or health evidence that subscription launch, local provider calls, and premium execution remain disabled by default.

## 13. Open Questions

1. Should execution attempt state persist in the existing supervisor state store first, or should a new table/store be introduced immediately?
2. What runtime export format should be used later for recoverable operational evidence: JSONL event export, SQLite backup, markdown handoff, or a combination?
3. Should attempt IDs be globally unique simple IDs or route/work-item-prefixed IDs for easier operator reading?
4. Which dashboard surface should own attempt history first: work-item detail page, controls page, or a dedicated execution page?

None of these open questions block Slice 1 if conservative defaults are used.

## 14. Recommended Defaults

- Use existing supervisor persistence patterns for the first attempt-state slice.
- Use stable opaque attempt IDs generated by the supervisor.
- Keep one active attempt per work item.
- Add dashboard attempt visibility to the work-item detail surface first.
- Use JSON-compatible attempt/evidence contracts so later export is straightforward.
- Treat all real process launch, provider HTTP calls, model calls, and premium calls as rejected in this PRD phase.

## 15. Future Work

After this PRD is implemented and verified, future PRDs may address:

- direct subscription-agent process lifecycle,
- local model provider enablement,
- premium execution approvals and provider boundary,
- runtime evidence export/backup,
- adaptive routing based on audited outcomes,
- broader workspace mutation and rollback automation.
