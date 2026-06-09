# Kendall_vNxt Overall Architecture

Date: 2026-06-08
Status: accepted baseline for current implementation
Scope: Kendall_vNxt governance, supervisor, dashboard, dynamic routing, and recovery boundaries

## Purpose

This document consolidates the early Chief of Staff / orchestrator concept with the architecture that now exists in the Kendall_vNxt repo. It is the durable architecture spine for future PRDs, stories, and implementation slices.

Kendall_vNxt is not a single chatbot and not a separate Bob Supervisor product. It is a local-first assistant operating system made of governance workflows, a supervisor orchestration runtime, an operator dashboard, shared contracts, and progressively authorized worker lanes.

## Source Artifacts

This architecture stitches together the current source of truth from:

- `docs/implementation-checkpoint-2026-06-06.md`
- `docs/environment-recovery-and-runtime-boundary.md`
- `docs/prds/supervisor-dynamic-routing-mvp-1.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/architecture/kendall-vnxt-authority-dependency-graph-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md`
- `docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md`
- `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`
- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/decisions/governance-coordinator-2026-06-01.md`
- `_bmad/memory/knx/decisions/runtime-assistant-behavior-planning-gate-2026-06-01.md`

## Architecture Summary

Kendall_vNxt uses a split control-plane architecture:

```text
User / Operator
      |
      v
Dashboard Operator Control Plane
      |
      v
Supervisor Orchestrator
      |
      +--> Workflow state, queue, events, audit trail
      +--> Dynamic routing engine
      +--> Policy gates and approval artifacts
      +--> Guarded utility execution
      +--> Future worker execution authority
      |
      v
Worker / Capability Lanes
      +--> Utility workers
      +--> Local read-only AI workers
      +--> Local provider workers, disabled until enabled by policy
      +--> Subscription handoff / future subscription agents
      +--> Premium approval / future premium execution

BMad + KNX Governance Layer
      |
      +--> Chief of Staff / governance coordinator
      +--> PRDs, architecture, stories, safety reviews
      +--> data boundaries, execution policy, source/evidence contracts
      +--> recovery and handoff trail
```

The dashboard is the human-facing operator surface. The supervisor is the system of record and orchestration runtime. KNX/BMad governance is the planning and decision layer that prevents implementation from outrunning safety, source boundaries, and recoverability.

## Major Components

### Chief of Staff / Governance Coordinator

The original Chief of Staff idea maps to the KNX governance coordinator, not to unchecked runtime autonomy.

Its job is to route work before implementation:

- decide which workflow or skill should handle the request,
- enforce source, storage, provider, and mutation boundaries,
- require mature-tool review before custom code or new dependencies,
- require source/evidence contracts before operational intake,
- require safety validation before expanded execution authority,
- preserve decision continuity through durable records.

The governance coordinator is the front door for planning and approval. It is not itself the runtime assistant and does not execute autonomous background behavior.

### Supervisor Orchestrator

The supervisor is the runtime orchestration service under `services/supervisor`.

It owns:

- work-item intake,
- queue state,
- workflow transitions,
- retry, assignment, escalation, and saved views,
- event history,
- routing decisions and routing evidence,
- policy gates and approval artifacts,
- guarded deterministic execution for narrow utility tasks.

The supervisor should progressively absorb repeatable execution mechanics. Broad architecture decisions, ambiguous debugging, risky mutation, and new authority boundaries remain human-directed until explicitly designed and approved.

### Dashboard Operator Control Plane

The dashboard under `apps/dashboard` is the operator-facing control plane.

It should show:

- intake and queue state,
- detail pages and action strips,
- attention and audit surfaces,
- routing badges and route explanations,
- worker registry and lane evidence,
- approval artifacts and handoff packages,
- human intervention points.

The dashboard should not become the source of workflow truth. Workflow rules, execution policy, and routing decisions belong in the supervisor and shared contracts.

### Shared Contracts And Workflow Core

`packages/contracts` defines the shared transport vocabulary between dashboard and supervisor.

`packages/workflow-core` holds shared workflow semantics. These packages keep the control plane and runtime aligned as new worker lanes and authority levels are added.

### Dynamic Routing Engine

The dynamic routing engine is now feature-complete for the safe foundation phase.

It provides:

- routing profile and decision vocabulary,
- route preview and dry-run workflows,
- dashboard-visible routing reasons,
- guarded utility worker routing,
- worker capability and health registry,
- routing outcome evidence,
- local read-only evidence packet contracts,
- mock local read-only worker previews,
- disabled metadata-only local provider entries,
- hardened subscription handoff packages,
- premium approval request artifacts,
- disabled subscription-agent launch stubs.

The routing engine is intentionally not yet a fully autonomous execution system. Its current job is to make routing decisions visible, auditable, and safely bounded before adding more execution authority.

## Execution Lanes

Kendall_vNxt uses capability lanes rather than binding the supervisor directly to one model or tool provider.

| Lane | Current State | Purpose |
| --- | --- | --- |
| Utility | Guarded and partially executable | Deterministic allowlisted tasks such as evidence collection and narrow checks. |
| Local read-only AI | Mock/read-only preview | Local evidence explanation without mutation or provider calls. |
| Local provider workers | Disabled metadata entries | Future Ollama, LM Studio, vLLM, and llama.cpp support. |
| Subscription handoff | Artifact generation only | High-quality handoff packages for Codex, Claude, Gemini, or similar agents. |
| Subscription agent | Disabled launch stub | Future direct process launch after lifecycle controls exist. |
| Premium approval | Approval artifact only | Future high-impact provider execution after explicit approval boundary. |

## Authority Ladder

Execution authority must advance gradually:

1. Record-only routing: classify and record decisions.
2. Advisory routing: recommend lanes and explain reasons.
3. Guarded utility execution: allow deterministic allowlisted internal tasks.
4. Read-only local AI preview: produce evidence packets and explanations without mutation.
5. Disabled launch stubs: represent future worker launch contracts without executing.
6. Approved process execution: future direct worker launch with isolation, lifecycle, cancellation, logging, and rollback.
7. Adaptive routing: future score tuning based on accumulated auditable outcomes.

No step should skip the safety contract required by the previous step.

## Runtime Assistant Behavior Boundary

Runtime assistant behavior means behavior that persists, triggers, schedules, observes, reads, writes, sends, routes, invokes tools, executes commands, or changes user-visible state outside the current explicit task turn.

That behavior remains disabled unless a later approval explicitly defines:

- storage location and retention policy,
- trigger source and trigger conditions,
- execution context and permissions,
- user-visible behavior,
- rollback and disable plan,
- validation plan,
- safety contract,
- logging and evidence requirements,
- exact source and destination boundaries.

This boundary is what keeps the Chief of Staff concept from turning into unsafe invisible automation.

## Recovery And Runtime Boundary

Kendall_vNxt should be recoverable from Git while keeping runtime state separate.

Tracked source-of-truth assets include:

- runtime source code,
- shared packages and contracts,
- setup scripts,
- dependency manifests and lockfiles,
- configuration examples,
- durable PRDs, architecture, checkpoints, and decision documents,
- deterministic fixtures that are part of the product.

Ignored or local-only state includes:

- installed dependencies,
- local databases,
- build outputs,
- generated BMad working artifacts,
- logs,
- test output,
- local secrets,
- machine-specific configuration.

Durable BMad outputs should be promoted into `docs/` when they need to survive machine loss or anchor future implementation.

## Safety Principles

Kendall_vNxt follows these architecture constraints:

- capability is not permission,
- local-first does not mean unrestricted local access,
- no credentials in prompts or generated artifacts,
- no external sends without explicit approval or recorded policy,
- no source mutation without explicit approval or recorded policy,
- no customer, production, credential, or account/security access without a dedicated boundary decision,
- no destructive or ambiguous data-loss actions without explicit approval,
- every worker action must leave evidence suitable for review and recovery.

## Current Completion State

The following architecture foundation is implemented or documented:

- split dashboard/supervisor/contracts/workflow-core control plane,
- KNX governance core and coordinator decision records,
- local-first profile and boundary policy,
- supervisor-owned workflow state and events,
- routing foundation and dashboard visibility,
- guarded utility worker adapter,
- worker registry and routing outcome evidence,
- local read-only packet and mock worker preview,
- disabled local provider entries,
- subscription handoff and disabled launch stub artifacts,
- premium approval request artifacts,
- first-class execution attempts and history,
- execution attempt lifecycle transitions and cancellation state,
- route-decision-bound execution approval,
- per-attempt workspace isolation plans,
- dashboard execution attempt evidence,
- disabled execution configuration checks,
- runtime evidence export,
- worker threat-boundary documentation and API,
- authority dependency graph for deferred worker execution,
- dashboard command/read boundary contract,
- execution-readiness report and provider enablement policy,
- queue lease versus execution attempt boundary,
- disabled local provider no-call proofs,
- process lifecycle design for future subscription-agent launch,
- runtime evidence export references for readiness and boundary reports,
- provider-specific disabled fixture policies,
- draft Ollama local provider PRD,
- recovery/runtime boundary documentation.

## Intentionally Deferred

The following require new PRDs or explicit safety decisions before implementation:

- direct subscription-agent process launch,
- real local model/provider calls,
- premium provider execution,
- adaptive routing/scoring,
- background runtime assistant behavior,
- broader source mutation workflows,
- customer/production/account/security integrations.

## Recommended Next Architecture Move

The Execution Authority Expansion PRD has produced the current non-executing control-plane spine. Enablement governance is now anchored by the authority dependency graph, dashboard command boundary, execution-readiness report, queue/attempt boundary, provider no-call proofs, process lifecycle design, provider fixture policies, and draft provider PRDs.

The architecture sequence should be:

1. keep this overall architecture as the spine,
2. maintain the authority dependency graph,
3. maintain dashboard read/command/approval boundaries,
4. maintain the execution-readiness and evidence policy,
5. maintain queue/attempt boundaries and disabled provider proofs,
6. maintain process lifecycle design and runtime evidence export references,
7. maintain provider-specific fixture policies and PRD drafts,
8. use readiness reports to identify missing evidence before future authority work,
9. only then implement provider-specific or subscription-agent launch authority.
