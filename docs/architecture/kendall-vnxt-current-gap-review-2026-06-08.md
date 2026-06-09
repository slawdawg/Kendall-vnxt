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

## Current Gaps

### 1. Provider-Specific Execution PRDs

The general readiness policy exists, but each executable authority still needs its own PRD or decision record before implementation.

Risk: a generic readiness report could be mistaken for approval to enable a specific provider or launch path.

Recommendation: draft provider-specific or subscription-agent PRDs only after the readiness report shows enough policy, test, dashboard, no-call proof, and rollback evidence for that lane.

### 2. Provider-Specific PRD Drafting

Disabled provider proofs exist, but no provider-specific executable lane has been approved.

Risk: generic OpenAI-compatible assumptions could hide provider differences in endpoints, auth, timeouts, model selection, retention, and cancellation behavior.

Recommendation: draft the first local-provider PRD only after choosing one provider and naming its exact endpoint, timeout, redaction, cancellation, and rollback constraints.

### 3. Provider Disabled Adapter Fixture Expansion

Disabled provider proofs exist, but they are still high-level no-call proofs.

Risk: provider PRDs could miss provider-specific prompt redaction, timeout, payload retention, and cancellation differences.

Recommendation: add provider-specific fixture cases for redaction, timeout, cancellation, and retention before HTTP adapter work.

## Recommended Build Order

1. Refresh architecture docs with the current Story 2.1-2.8 state.
2. Add the deferred authority dependency graph.
3. Add a dashboard command/read boundary contract.
4. Add execution-readiness report, provider enablement policy, attempt evidence reporting, and outcome evidence reporting.
5. Clarify queue lease versus execution attempt boundaries and add provider-specific disabled adapter proofs.
6. Draft process lifecycle design and polish runtime evidence exports.
7. Add provider-specific disabled fixture expansion and PRDs.
8. Only then implement real local provider calls or direct subscription-agent launch.

## Recommended Immediate Story

Title: Provider Disabled Adapter Fixture Expansion

Goal: Add provider-specific disabled adapter fixture cases for redaction, timeout, cancellation, and retention before any provider HTTP adapter exists.

Acceptance outline:

- Cover Ollama, LM Studio, vLLM, and llama.cpp.
- Prove fixtures do not call provider endpoints or model APIs.
- Prove redaction and retention policy is provider-specific.
- Keep disabled provider proofs visible in readiness reporting.
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
