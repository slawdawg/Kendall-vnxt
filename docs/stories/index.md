# Story Index

Date: 2026-06-08
Status: current navigation index

## Blocked Pending Explicit Approval

These stories must not be implemented until the operator explicitly approves the named authority and scope.

### Ollama Local Provider

- `4-1-ollama-provider-settings-and-registry-gates.md`
- `4-2-ollama-prompt-redaction-and-retention-contract.md`
- `4-3-ollama-timeout-cancellation-and-attempt-evidence.md`
- `4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`

### Subscription-Agent Launch

- `5-1-subscription-launch-settings-policy-and-target-registry.md`
- `5-2-subscription-launch-approval-binding-and-stale-rejection.md`
- `5-3-subscription-launch-workspace-output-and-session-contract.md`
- `5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
- `5-5-subscription-launch-supervised-process-behind-approval.md`

## Recent Ready For Review Stories

| Story | Slice |
| --- | --- |
| `3-39-report-shortcut-anchor-polish.md` | Work-item evidence overview links related supervisor reports to specific controls-page report anchors. |
| `3-38-runbook-managed-recipe-check-chain.md` | Runbook verification guard for the active check chain after adding managed recipe policy drift checks. |
| `3-37-managed-recipe-policy-drift-check.md` | Required static drift check for managed recipe policy report contracts, route, dashboard rendering, browser assertions, tests, and story evidence. |
| `3-36-managed-recipe-policy-report.md` | Read-only controls-page report for managed recipe gates, allowed paths, commands, and blocked remote automation posture. |
| `3-35-runbook-check-chain-hardening.md` | Runbook verification guard for the full active check chain, including runtime export and safe backlog drift checks. |
| `3-34-report-shortcuts-in-evidence-overview.md` | Work-item evidence overview shortcuts for runtime export related supervisor reports and the controls catalog. |
| `3-33-evidence-overview-review-shortcuts.md` | Work-item evidence overview shortcuts backed by runtime export review navigator items. |
| `3-32-safe-development-backlog-drift-check.md` | Required static drift check for safe backlog contracts, blocked authority stop lines, dashboard rendering, browser assertions, and story evidence. |
| `3-31-runtime-evidence-export-drift-check.md` | Required static drift check for runtime export contracts, navigator, dashboard rendering, tests, and story evidence. |
| `3-30-runtime-evidence-review-navigator.md` | Read-only navigator for runtime state, authority boundary, and git-backed evidence review. |
| `3-29-runbook-verification-alignment.md` | Static runbook verification for current operator docs and active verification commands. |
| `3-28-supervisor-report-catalog-drift-check.md` | Required static drift check for supervisor report catalog routes, runtime references, dashboard fetches, and story evidence. |
| `3-27-safe-development-backlog-report.md` | Read-only safe backlog map for larger coherent development slices while execution authority remains blocked. |
| `3-26-dashboard-e2e-report-drift-check.md` | Required static drift check for dashboard e2e report commands, browser assertions, and story references. |
| `3-25-managed-recipe-e2e-runners.md` | Focused managed-recipe browser runners using shared lifecycle helper. |
| `3-24-dashboard-mobile-e2e-runner.md` | Focused mobile dashboard browser runner using shared lifecycle helper. |
| `3-23-dashboard-e2e-runner-lifecycle-helper.md` | Shared owned-lifecycle helper for focused dashboard browser runners. |
| `3-22-dashboard-e2e-report.md` | Read-only dashboard browser verification map for focused/full e2e runners. |
| `3-21-dashboard-detail-e2e-runner.md` | Focused work-item detail e2e command and owned lifecycle runner. |
| `3-20-runtime-evidence-review-manifest.md` | Runtime evidence export review manifest and dashboard panel polish. |
| `3-19-maintenance-readiness-report.md` | Read-only maintenance readiness map and controls-page safe work panel. |
| `3-18-supervisor-report-catalog.md` | Read-only supervisor report catalog and controls-page evidence map. |
| `3-17-dashboard-e2e-reliability-guardrails.md` | Focused controls-page e2e command and repo-local Playwright cache defaults. |
| `3-16-verification-readiness-report.md` | Read-only verification readiness report and controls panel. |
| `3-15-documentation-authority-report.md` | Read-only documentation authority report and controls panel. |
| `3-14-dashboard-evidence-overview-polish.md` | Read-only dashboard evidence overview. |
| `3-13-execution-authority-approval-checkpoints.md` | Approval checkpoint governance. |
| `3-12-subscription-agent-launch-prd.md` | Launch PRD drafting. |
| `3-11-runtime-evidence-export-dashboard-access.md` | Runtime export dashboard access. |
| `3-10-provider-fixtures-and-ollama-prd-draft.md` | Provider fixture policy and Ollama PRD draft. |
| `3-9-process-lifecycle-design-and-runtime-export-polish.md` | Process lifecycle design and export references. |
| `3-8-queue-attempt-boundary-and-provider-proofs.md` | Queue/attempt boundary and provider no-call proofs. |
| `3-7-execution-readiness-and-evidence-report.md` | Execution readiness reporting. |
| `3-6-dashboard-command-boundary-contract.md` | Dashboard command/read boundary. |
| `3-5-architecture-authority-dependency-graph.md` | Deferred authority dependency graph. |

## Completed Foundation Stories

Stories under `1-*` and `2-*` establish the current safe foundation:

- routing preview, dry-run, route rationale, lane profiles, and record-only overrides,
- guarded utility worker behavior and outcome evidence,
- worker registry and disabled provider entries,
- local read-only packets, mock previews, and explanations,
- subscription handoff and disabled launch stubs,
- premium approval artifacts,
- execution attempts, lifecycle, approval binding, workspace isolation, dashboard attempt evidence, configuration checks, runtime exports, and threat boundary.

## Current Rule

Generic continuation language does not approve blocked authority stories. Use `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md` before moving any blocked story to ready.
