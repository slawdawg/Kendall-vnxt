---
title: "Kendall_vNxt Supervisor Dynamic Routing Follow-On Roadmap"
status: draft
created: 2026-06-08
updated: 2026-06-08
source_prd: "docs/prds/supervisor-dynamic-routing-mvp-1.md"
source_brainstorm: "_bmad-output/brainstorming/brainstorming-session-2026-06-07-194145.md"
---

# Kendall_vNxt Supervisor Dynamic Routing Follow-On Roadmap

## 1. Current Position

MVP 1 established the supervisor dynamic routing base:

- lane-centered routing contract
- deterministic route preview
- optional routing workflow events
- dashboard route explanation surface
- guarded deterministic utility authorization for an existing managed action
- structured subscription handoff packages
- local read-only evidence explanation artifacts
- lane evidence profiles
- record-only operator override evidence

The next phase should not jump straight to arbitrary worker launch. The highest-value path is to turn the current route evidence into controlled execution capability in small authority steps.

## 2. Product Direction

Supervisor dynamic routing should remain a Kendall_vNxt supervisor capability, not a separate orchestrator product.

The core product promise is:

> Route work through the cheapest safe lane first, preserve premium and subscription attention for work that deserves it, and record every routing decision so the operator can trust the system as it gains authority.

This means the next work should prioritize:

- execution safety boundaries
- provider-neutral worker contracts
- deterministic utility execution
- local read-only model use only after evidence boundaries are clear
- structured handoff quality before direct subscription-agent launch
- dashboard visibility only where it helps routing trust

## 3. Remaining Idea Buckets

### 3.1 Utility Worker Routing

Status: ready for implementation design.

This is the safest first real routed execution lane because it is deterministic and already maps to supervisor-owned operations.

Use for:

- git status and diff summaries
- path-scope checks
- repo inventory
- lint/test command planning
- delivery package validation
- log collection and compression
- local environment checks

Required before broader execution:

- command allowlist
- path allowlist
- per-job workspace or read-only mode
- structured command logs
- timeout and cancellation policy
- event recording for attempt, result, and failure
- operator-visible escalation reason when utility work fails

Recommended next slice:

Add a `UtilityWorkerAdapter` contract and route one or two existing deterministic checks through it behind a guarded authority mode. Keep the command set tiny.

### 3.2 Worker Adapter And Capability Registry

Status: needs architecture before implementation.

The supervisor needs a provider-neutral registry before it should support local models, subscription agents, or premium workers.

Core objects:

- `WorkerAdapter`
- `WorkerCapability`
- `WorkerPermissionEnvelope`
- `WorkerHealth`
- `WorkerEstimate`
- `WorkerAttempt`
- `RoutingOutcome`

Adapter methods:

- `health()`
- `capabilities()`
- `estimate(task)`
- `run(task)`
- `cancel(job_id)`

The registry should separate capability from permission. A worker may be capable of editing files or running commands, but the current route may still deny those permissions.

Recommended next slice:

Add read-only provider and worker configuration schemas plus a health registry endpoint with static/fake workers first. Do not run external workers yet.

### 3.3 Local Read-Only AI Worker

Status: design-ready after worker registry.

This should be the first LLM-backed local lane because it can add value without touching files or running commands.

Use for:

- failed test explanation
- log review
- evidence summarization
- likely-cause analysis
- escalation recommendation
- handoff package compression

Boundaries:

- no file writes
- no shell commands
- no secrets in prompt payloads
- prompt built only from approved evidence packets
- output stored as an explanation artifact, not trusted as validation
- failed or low-confidence output escalates to subscription handoff, not direct patching

Recommended next slice:

Define an `EvidencePacket` contract and local explanation request/response contract. Then add a mock local worker adapter before connecting Ollama, LM Studio, vLLM, or llama.cpp.

### 3.4 Subscription Agent Handoff Quality

Status: partially implemented; ready for quality hardening.

Structured handoff packages now exist. Before launching Codex or Claude directly, the supervisor should prove that these packages are useful, bounded, and safe.

Improve handoffs with:

- explicit allowed paths
- blocked paths
- current route
- failed attempts
- validation evidence
- stop conditions
- expected output format
- operator note
- acceptance criteria
- rollback guidance

Recommended next slice:

Add handoff package templates by task kind and tests that prove high-risk tasks include stronger constraints than low-risk tasks.

### 3.5 Direct Subscription Agent Launch

Status: not ready for implementation.

Directly spawning subscription agents creates harder problems:

- authentication/session management
- background process lifecycle
- streaming output
- cancellation
- workspace isolation
- retry semantics
- cost and quota awareness
- secret leakage risk
- conflict with operator work

Required gates:

- handoff package quality is proven
- worker adapter contract exists
- per-job workspace policy exists
- command/process audit events exist
- operator approval flow exists
- cancellation semantics are tested

Recommended next slice later:

Add a disabled `subscription_agent` adapter stub that can estimate and produce launch instructions, but cannot spawn a process.

### 3.6 Premium Approval Lane

Status: policy design only.

Premium usage should remain approval-gated and reserved for cases where failure cost is higher than usage cost.

Use for:

- architecture decisions
- security-sensitive review
- repeated failed attempts
- high-impact multi-file changes
- final validation when local/subscription confidence is low

Recommended next slice:

Add premium approval request artifacts and lane-profile evidence, not premium execution.

### 3.7 Fleet Dashboard

Status: defer until registry and attempts exist.

A fleet dashboard is useful only after there is real worker state to show. Before that, it risks becoming decorative.

First useful dashboard version:

- lane profile summaries
- current worker health
- queue depth
- recent failures
- disabled lanes and why
- usage pressure mode
- override frequency

Recommended next slice:

After worker registry exists, add a compact "Routing Fleet" panel under supervisor controls. Do not make it the product center.

### 3.8 Adaptive Routing

Status: defer until there is enough outcome evidence.

Adaptive routing should use auditable evidence, not hidden learning.

Evidence needed:

- selected lane
- selected worker
- task kind
- runtime
- validation result
- failure class
- escalation reason
- operator override reason
- what would have avoided escalation

Recommended next slice:

Add `RoutingOutcome` event recording after each guarded route-controlled attempt. Use it for reporting first, not scoring.

## 4. Recommended Build Order

1. Utility worker execution policy and adapter contract.
2. Guarded utility worker for a tiny allowlisted command set.
3. Worker capability and health registry with static/fake workers.
4. Routing outcome events for guarded attempts.
5. EvidencePacket contract for local read-only AI.
6. Mock local read-only AI adapter.
7. OpenAI-compatible local worker adapter behind disabled or read-only mode.
8. Handoff package templates and quality hardening.
9. Premium approval request artifacts.
10. Fleet dashboard panel backed by real registry and outcome data.
11. Disabled subscription-agent launch stub.
12. Direct subscription-agent launch only after process, workspace, approval, and cancellation gates are proven.
13. Adaptive scoring only after outcome evidence has accumulated.

## 5. Recommended Next Story

The next implementation-ready story is:

**Guarded Utility Worker Adapter Contract**

Goal:

Introduce a provider-neutral utility worker adapter and route one existing deterministic supervisor action through it in guarded mode, while preserving the current safety boundaries.

Acceptance outline:

- Define utility worker task/request/result contracts.
- Add a tiny allowlist for deterministic commands or internal utility functions.
- Record worker attempt events with command/function id, allowed paths, timeout, result, and failure reason.
- Keep execution limited to existing supervisor-owned deterministic behavior.
- Do not add local LLM, subscription agent launch, premium execution, or fleet dashboard changes.
- Add integration tests proving guarded utility execution records attempt/result evidence and rejects non-allowlisted work.

Why this is next:

The router already has route decisions, handoff packages, local explanation artifacts, lane profiles, and override evidence. The missing capability is a real worker boundary that can safely execute one narrow class of routed work.

