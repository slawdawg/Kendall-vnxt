# Kendall_vNxt Current Gap Review And Recommendations

Date: 2026-06-08
Updated: 2026-06-13 after Story 4.4 approved VM-to-host Ollama implementation, Epic 8 artifact-only subscription launch evidence, and Epic 10 delivery/cleanup planning, evidence, Dev Console, and approval-ledger hardening
Previous safe-work update: Updated: 2026-06-09 through Story 3.65 evidence-link and drift-check coverage
Status: current recommendation
Scope: Architecture, PRDs, stories, supervisor implementation, dashboard implementation, and routing follow-on work

## Summary

The execution-attempt control plane is now implemented. Kendall_vNxt can represent execution attempts, reject unsafe lanes, record lifecycle and approval evidence, attach workspace isolation plans, expose runtime evidence exports, show attempt evidence in the dashboard, and surface disabled-by-default execution and threat-boundary checks.

The remaining gap is not basic execution-attempt state. It is the governance and enablement layer required before additional real workers or broader authority lanes can be turned on.

Current safe posture:

- Routing and attempt evidence are inspectable.
- Direct process launch remains disabled; Story 8.5 completed only the exact-approved artifact-only fixture path without production process launch authority.
- Local provider/model calls remain disabled except for Story 4.4's exact-approved VM-to-host Ollama endpoint/model boundary.
- Ollama Stories 4.1-4.3 add non-executing settings, registry, prompt/retention, timeout/cancellation, dashboard, export, and no-call fixture evidence; Story 4.4 adds the approved VM-to-host adapter boundary only.
- Premium execution remains disabled.
- Arbitrary shell execution remains disabled.
- Worker source mutation, network access, and credential access remain disabled.

## Navigation Indexes

Use these indexes before starting new architecture, PRD, story, or authority work:

- `docs/architecture/index.md`
- `docs/workflows/product-requirements-boundary.md`
- `docs/workflows/implementation-evidence-boundary.md`

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
- Ollama PRD review decisions, non-executing Stories 4.1-4.3, and approved Story 4.4 VM-to-host execution adapter boundary.
- Dashboard runtime evidence export access.
- Draft subscription-agent launch PRD.
- Subscription-agent launch PRD review decisions and blocked implementation story breakdown.
- Execution authority approval checkpoint rules.
- Dashboard evidence overview polish.
- Documentation authority indexes, drift checks, and controls-page report.
- Verification readiness commands, stop lines, and controls-page report.
- Verification execution plan groups for ordered setup, static drift, dashboard/browser, supervisor behavior, full local, and optional remote checks.
- Verification handoff checkpoints for local delivery, dashboard changes, fresh-VM setup, and authority-boundary gates.
- Dashboard e2e reliability guardrails for focused controls-page verification.
- Supervisor report catalog for read-only evidence navigation.
- Maintenance readiness report for safe repo hygiene while authority stories remain blocked.
- Maintenance readiness evidence links for reviewing related reports, docs, and anchors from each safe maintenance lane.
- Safe development backlog report for selecting larger coherent safe slices while authority stories remain blocked.
- Safe backlog report anchors for jumping from backlog items to supporting controls-page report evidence.
- Runtime evidence review manifest for export counts, retention notes, and stop lines.
- Runtime evidence review navigator for runtime state, authority boundary, and git-backed evidence shortcuts.
- Runtime evidence export drift checking for contracts, schemas, navigator items, dashboard rendering, and story evidence.
- Focused dashboard detail e2e runner for runtime export verification.
- Dashboard e2e report for focused/full browser verification commands, lifecycle posture, cache posture, stop lines, and static drift checking.
- Supervisor report catalog drift checking for report routes, runtime references, dashboard fetches, browser assertions, and story evidence.
- Runbook verification alignment for current operator setup, bootstrap, and handoff instructions.
- Runbook managed recipe check-chain alignment for the active `check:managed-recipes` verification command.
- Maintenance action plan report for selecting larger safe slices with verification commands, evidence links, dashboard anchors, and authority stop lines.
- Maintenance action evidence links for reviewing related reports and docs from each safe action step.
- Authority readiness matrix report for blocked execution-authority families, approval evidence, related reports, and stop lines.
- Development runway report for larger PR-sized safe slices across report/evidence navigation, verification/runbook hardening, and authority-blocker maintenance.
- Development runway readiness checks for per-slice ready/blocked evidence before larger PR work starts.
- Development runway PR batching policy for larger reviewable PR defaults, anti-fragmentation guidance, and PR body checklist evidence.
- Development runway evidence links for reviewing related reports, docs, and dashboard anchors from each larger safe slice and readiness check.
- Runtime evidence review report for the work-item runtime evidence review queue, review priority, evidence counts, and safe review actions.
- Work-item review queue shortcuts in the evidence overview for review priority, evidence counts, recommended action, runtime export navigation, and controls-page review index navigation.
- Runtime review evidence links for queued work-item related reports, docs, and dashboard anchors.
- Shared dashboard e2e runner lifecycle helper for focused browser verification scripts.
- Focused mobile dashboard e2e runner for phone-sized intake draft verification.
- Focused managed-recipe e2e runners for dashboard and mobile coverage intake templates.
- Managed recipe policy report and dedicated drift checking for recipe gates, path policies, command evidence, and blocked remote automation.
- Evidence overview report shortcuts and runtime export report links that jump to stable controls-page report anchors.
- GitHub workflow policy report for Git/GCM, Codex GitHub connector, optional gh auth, doctor commands, connector probe, and plaintext-token stop lines.
- Safe backlog delivery-hygiene guidance for larger PR slices, Git/GCM or connector-backed remote work, and plaintext-token stop lines.
- Delivery readiness policy report for PR, CI, merge, and local-only waiver rules without remote automation approval.
- Delivery readiness policy drift check in the active verification chain and current runbooks.
- Epic 10 low-risk delivery and cleanup planning, metadata-only delivery execution evidence, cleanup residue classification, Dev Console visibility, and trusted approval-ledger binding. As verified on 2026-06-13, PR #103 was CI-green and externally review-gated; re-check GitHub before claiming merge to `main`.
- Maintenance readiness drift check in the active verification chain and current runbooks.
- Core readiness drift checks for documentation authority and verification readiness reports.
- Execution boundary drift check for execution configuration, execution readiness, and threat-boundary reports.
- Execution evidence drift check for execution-state boundary and disabled-provider proof reports.
- Provider fixture policy drift check for disabled local-provider fixture baselines.
- Process lifecycle policy drift check for future subscription-agent process launch planning and disabled launch evidence.
- Maintenance action plan drift check for safe slice selection, report/runtime references, controls-page rendering, and story evidence.
- Authority readiness matrix drift check for blocked story mapping, approval evidence, report/runtime references, controls-page rendering, and story evidence.
- Development runway drift check for larger PR-sized safe slices, report/runtime references, controls-page rendering, runbooks, and story evidence.
- Runtime evidence review drift check for work-item runtime export review indexing, detail-page review queue shortcuts, report/runtime references, controls-page rendering, runbooks, and story evidence.
- Verification readiness drift coverage for command group contracts, service construction, controls-page rendering, and browser assertions.

## Current Gaps

### 1. Provider-Specific Execution PRDs

The general readiness policy exists, but each executable authority still needs its own PRD or decision record before implementation.

Risk: a generic readiness report could be mistaken for approval to enable a specific provider or launch path.

Recommendation: draft provider-specific or subscription-agent PRDs only after the readiness report shows enough policy, test, dashboard, no-call proof, and rollback evidence for that lane.

### 2. Provider PRD Approval And Story Breakdown

The Ollama provider PRD exists as a draft. Stories 4.1-4.3 cover non-executing preparation, and Story 4.4 implemented only the exact-approved VM-to-host endpoint/model lane.

Risk: generic OpenAI-compatible assumptions could hide provider differences in endpoints, auth, timeouts, model selection, retention, and cancellation behavior.

Recommendation: keep Story 4.4 limited to the approved VM-to-host endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`. Only expand provider calls after a successor approval names the new endpoint, model id, scope, evidence, stop lines, and rollback plan.

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

Title: Current-State Reconciliation And Next-Lane Authority Planning

Goal: Keep checks, docs, blocked-story state, PR delivery state, and read-only evidence surfaces current before selecting the next authority lane.

Acceptance outline:

- Run and document relevant checks.
- Keep blocked authority stories blocked unless exact approval is present.
- Distinguish local story completion, stacked PR merge, CI-green PR state, and merged-to-main state.
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
