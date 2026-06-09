# Kendall_vNxt Current Gap Review And Recommendations

Date: 2026-06-08
Updated: 2026-06-09 after safe evidence, managed recipe policy, runbook chain, report-anchor polish, GitHub workflow policy, safe delivery hygiene, delivery readiness policy, delivery readiness drift coverage, maintenance readiness drift coverage, core readiness drift coverage, and execution boundary drift coverage through Story 3.48
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

## Navigation Indexes

Use these indexes before starting new architecture, PRD, story, or authority work:

- `docs/architecture/index.md`
- `docs/prds/index.md`
- `docs/stories/index.md`

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
- Ollama PRD review decisions and blocked implementation story breakdown.
- Dashboard runtime evidence export access.
- Draft subscription-agent launch PRD.
- Subscription-agent launch PRD review decisions and blocked implementation story breakdown.
- Execution authority approval checkpoint rules.
- Dashboard evidence overview polish.
- Documentation authority indexes, drift checks, and controls-page report.
- Verification readiness commands, stop lines, and controls-page report.
- Dashboard e2e reliability guardrails for focused controls-page verification.
- Supervisor report catalog for read-only evidence navigation.
- Maintenance readiness report for safe repo hygiene while authority stories remain blocked.
- Safe development backlog report for selecting larger coherent safe slices while authority stories remain blocked.
- Runtime evidence review manifest for export counts, retention notes, and stop lines.
- Runtime evidence review navigator for runtime state, authority boundary, and git-backed evidence shortcuts.
- Runtime evidence export drift checking for contracts, schemas, navigator items, dashboard rendering, and story evidence.
- Focused dashboard detail e2e runner for runtime export verification.
- Dashboard e2e report for focused/full browser verification commands, lifecycle posture, cache posture, stop lines, and static drift checking.
- Supervisor report catalog drift checking for report routes, runtime references, dashboard fetches, browser assertions, and story evidence.
- Runbook verification alignment for current operator setup, bootstrap, and handoff instructions.
- Runbook managed recipe check-chain alignment for the active `check:managed-recipes` verification command.
- Shared dashboard e2e runner lifecycle helper for focused browser verification scripts.
- Focused mobile dashboard e2e runner for phone-sized intake draft verification.
- Focused managed-recipe e2e runners for dashboard and mobile coverage intake templates.
- Managed recipe policy report and dedicated drift checking for recipe gates, path policies, command evidence, and blocked remote automation.
- Evidence overview report shortcuts and runtime export report links that jump to stable controls-page report anchors.
- GitHub workflow policy report for Git/GCM, Codex GitHub connector, optional gh auth, doctor commands, connector probe, and plaintext-token stop lines.
- Safe backlog delivery-hygiene guidance for larger PR slices, Git/GCM or connector-backed remote work, and plaintext-token stop lines.
- Delivery readiness policy report for PR, CI, merge, and local-only waiver rules without remote automation approval.
- Delivery readiness policy drift check in the active verification chain and current runbooks.
- Maintenance readiness drift check in the active verification chain and current runbooks.
- Core readiness drift checks for documentation authority and verification readiness reports.
- Execution boundary drift check for execution configuration, execution readiness, and threat-boundary reports.

## Current Gaps

### 1. Provider-Specific Execution PRDs

The general readiness policy exists, but each executable authority still needs its own PRD or decision record before implementation.

Risk: a generic readiness report could be mistaken for approval to enable a specific provider or launch path.

Recommendation: draft provider-specific or subscription-agent PRDs only after the readiness report shows enough policy, test, dashboard, no-call proof, and rollback evidence for that lane.

### 2. Provider PRD Approval And Story Breakdown

The Ollama provider PRD exists as a draft, but no executable lane has been approved or broken into implementation stories.

Risk: generic OpenAI-compatible assumptions could hide provider differences in endpoints, auth, timeouts, model selection, retention, and cancellation behavior.

Recommendation: review the Ollama PRD, resolve open questions, then split it into implementation stories only if explicit approval is granted.

### 3. Maintenance And Hygiene

The main execution-authority planning and read-only evidence surfaces are now in place. The safest continuing work is maintenance and hygiene while waiting for explicit authority approval.

Risk: docs, blocked story state, and verification commands may drift as the repo grows.

Recommendation: keep docs, tests, evidence surfaces, and blocked-story status current; add small read-only improvements only when they reduce review friction.

## Recommended Build Order

1. Keep safe maintenance and evidence-navigation slices current while execution authority remains blocked.
2. Keep architecture, handoffs, runbooks, static drift checks, and story indexes aligned with the active verification chain.
3. Review provider-specific PRDs only when the operator explicitly wants to move an authority lane toward approval.
4. Only then implement real local provider calls or direct subscription-agent launch after explicit approval naming authority and scope.

## Recommended Immediate Story

Title: Maintenance And Hygiene

Goal: Keep checks, docs, blocked-story state, and read-only evidence surfaces current while waiting for explicit execution-authority approval.

Acceptance outline:

- Run and document relevant checks.
- Keep blocked authority stories blocked unless explicit approval is present.
- Improve docs/tests/read-only evidence surfaces where useful, preferably in larger coherent slices.
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
