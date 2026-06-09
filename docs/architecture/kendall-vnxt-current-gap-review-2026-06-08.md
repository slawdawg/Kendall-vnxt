# Kendall_vNxt Current Gap Review And Recommendations

Date: 2026-06-08
Updated: 2026-06-08 after execution-authority Stories 2.1-2.8
Status: current recommendation
Scope: Architecture, PRDs, stories, supervisor implementation, dashboard implementation, and routing follow-on work

## Summary

The execution-attempt control plane is now implemented. Kendall_vNxt can represent execution attempts, reject unsafe lanes, record lifecycle and approval evidence, attach workspace isolation plans, expose runtime evidence exports, show attempt evidence in the dashboard, and surface disabled-by-default execution and threat-boundary checks.

The remaining gap is not basic execution-attempt state. It is the governance and enablement layer required before real workers can be turned on.

Current safe posture:

- Routing and attempt evidence are inspectable.
- Real process launch remains disabled.
- Local provider/model calls remain disabled.
- Premium execution remains disabled.
- Arbitrary shell execution remains disabled.
- Worker source mutation, network access, and credential access remain disabled.

## What Is Already Covered

Do not rebuild these as new architecture work:

- Work-item routing preview and route rationale in the dashboard.
- Compact routing fleet and static worker registry surfaces.
- Guarded utility worker adapter for narrow deterministic supervisor behavior.
- Routing outcome evidence for guarded utility attempts.
- Local read-only evidence packet and deterministic mock worker preview.
- Disabled OpenAI-compatible local provider entries.
- Subscription handoff package generation.
- Premium approval request artifact generation.
- Disabled subscription-agent launch stub artifacts.
- First-class execution attempts and history.
- Attempt lifecycle transitions and cancellation state.
- Route-decision-bound approval and stale decision rejection.
- Per-attempt workspace isolation plans.
- Dashboard execution attempt evidence panel.
- Disabled execution configuration checks.
- Runtime evidence export for work items.
- Worker threat-boundary documentation and API.
- Connector-backed GitHub workflow documentation.

## Current Gaps

### 1. Deferred Authority Dependency Graph

Deferred authority is listed, but the architecture needs a dependency graph that names prerequisites for each future authority type:

- local provider/model calls,
- direct subscription-agent launch,
- premium execution,
- arbitrary command execution,
- source mutation,
- adaptive routing/scoring.

Risk: future work could enable one authority type without satisfying its specific upstream controls.

Recommendation: add an architecture dependency graph and keep it close to the overall architecture and threat boundary docs.

### 2. Dashboard Command/Read Boundary Contract

The dashboard code separates read helpers and command helpers, but architecture docs do not yet classify which surfaces are read-only, record-only, approval-bearing, or execution-prohibited.

Risk: future UI work could add controls that imply execution authority before the backend permits it.

Recommendation: document the dashboard command boundary and require new controls to state their authority class.

### 3. Provider Enablement Policy

Settings and registry checks deny execution by default, but the project needs a single policy for how a provider moves from disabled capability to executable authority.

Risk: config shortcuts could bypass PRD, threat, dashboard, and test requirements.

Recommendation: define an enablement ladder: PRD decision, threat update, settings gate, registry state, permission envelope, dashboard copy, focused tests, and rollback plan.

### 4. Attempt Evidence Reporting Polish

Attempt evidence is visible, but operators would benefit from a compact summary of current attempts, disabled reasons, latest lifecycle event, and next safe action.

Risk: evidence exists but may be too scattered for repeated operator review.

Recommendation: add a small reporting layer before any real worker launch.

### 5. Outcome Evidence Expansion

Guarded utility outcome evidence exists, but adaptive scoring is still premature.

Risk: hidden or sparse scoring could make routing less predictable.

Recommendation: add reporting-only outcome fields first: selected lane, worker, task kind, runtime, validation result, failure class, escalation reason, and operator override reason.

## Recommended Build Order

1. Refresh architecture docs with the current Story 2.1-2.8 state.
2. Add the deferred authority dependency graph.
3. Add a dashboard command/read boundary contract.
4. Add provider enablement policy and tests around disabled defaults.
5. Add compact attempt evidence reporting.
6. Expand routing outcome evidence for reporting.
7. Only then draft PRDs for real local provider calls or direct subscription-agent launch.

## Recommended Immediate Story

Title: Architecture Authority Dependency Graph

Goal: Document the dependency gates for each deferred execution authority so future implementation can proceed without accidentally enabling unsafe worker behavior.

Acceptance outline:

- Add a dependency graph for local provider/model calls, direct subscription-agent launch, premium execution, arbitrary command execution, source mutation, and adaptive scoring.
- Link each authority type to required existing controls and missing controls.
- State stop conditions for any implementation that would cross from control-plane evidence into real execution.
- Update the current gap review and overall architecture pointers.
- Verify docs-only changes with `git diff --check` and the normal workspace check when practical.

## Stop Conditions

Stop for explicit operator approval before any implementation would require:

- real process launch,
- real local model/provider HTTP calls,
- premium provider calls,
- broad source mutation,
- destructive file operations,
- credential access,
- externally hosted services,
- changing the recovery/runtime boundary.

Architecture, documentation, tests, and non-executing control-plane work may proceed with conservative defaults.
