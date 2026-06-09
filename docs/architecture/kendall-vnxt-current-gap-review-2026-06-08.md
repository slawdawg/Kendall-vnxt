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
- Dashboard command/read boundary contract.
- Authority dependency graph for deferred worker execution.
- Execution-readiness report and provider enablement policy.
- Compact attempt evidence reporting for readiness review.
- Reporting-only routing outcome evidence expansion.
- Queue lease versus execution attempt boundary.
- Disabled local provider no-call proofs for Ollama, LM Studio, vLLM, and llama.cpp.
- Process lifecycle design for future subscription-agent launch.
- Runtime evidence export references for readiness and boundary reports.
- Provider-specific disabled fixture policies.
- Draft Ollama local provider PRD.

## Current Gaps

### 1. Provider-Specific Execution PRDs

The general readiness policy exists, but each executable authority still needs its own PRD or decision record before implementation.

Risk: a generic readiness report could be mistaken for approval to enable a specific provider or launch path.

Recommendation: draft provider-specific or subscription-agent PRDs only after the readiness report shows enough policy, test, dashboard, no-call proof, and rollback evidence for that lane.

### 2. Provider PRD Approval And Story Breakdown

The Ollama provider PRD exists as a draft, but no executable lane has been approved or broken into implementation stories.

Risk: generic OpenAI-compatible assumptions could hide provider differences in endpoints, auth, timeouts, model selection, retention, and cancellation behavior.

Recommendation: review the Ollama PRD, resolve open questions, then split it into implementation stories only if explicit approval is granted.

### 3. Runtime Evidence Export Dashboard Access

Runtime exports include readiness and boundary report references, but the dashboard does not yet provide an operator shortcut to exports.

Risk: useful evidence exists but remains API-only during operator review.

Recommendation: add dashboard access or summaries for runtime exports without adding execution controls.

## Recommended Build Order

1. Refresh architecture docs with the current Story 2.1-2.8 state.
2. Add the deferred authority dependency graph.
3. Add a dashboard command/read boundary contract.
4. Add execution-readiness report, provider enablement policy, attempt evidence reporting, and outcome evidence reporting.
5. Clarify queue lease versus execution attempt boundaries and add provider-specific disabled adapter proofs.
6. Draft process lifecycle design and polish runtime evidence exports.
7. Add provider-specific disabled fixture expansion and the first provider PRD draft.
8. Add dashboard access to runtime evidence exports.
9. Only then implement real local provider calls or direct subscription-agent launch after explicit approval.

## Recommended Immediate Story

Title: Runtime Evidence Export Dashboard Access

Goal: Add dashboard access to existing runtime evidence exports so operators can inspect readiness, boundary, attempt, and event evidence from the work-item surface.

Acceptance outline:

- Add a read-only dashboard control or link for runtime evidence export.
- Display export safety flags and related supervisor report references.
- Do not add execution controls or provider enablement controls.
- Keep all current execution authority disabled.

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
