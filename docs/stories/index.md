# Story Index

Date: 2026-06-08
Status: current navigation index

## Blocked Pending Explicit Approval

These stories must not be implemented until the operator explicitly approves the named authority and scope.

### Orchestrator CLI Worker Launch

The orchestrator planning spike is safe to refine, but real Codex CLI process launch and real Claude Code CLI process launch remain blocked pending explicit approval.

- `6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`

### Ollama Local Provider

No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model. Any endpoint, model, provider, or retention expansion still requires explicit successor approval.

### Subscription-Agent Launch

- `5-5-subscription-launch-supervised-process-behind-approval.md`

## Recent Ready For Review Stories

| Story | Slice |
| --- | --- |
| `6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md` | Orchestrator fake-worker spike with deterministic lane selection, metadata-only evidence, blocked real CLI launch, and 10 scenario fixtures for Ollama, Codex, Claude review, and GitHub workflow rails. |
| `4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md` | VM-to-host Ollama limited provider adapter for endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`, with metadata-only retention and disabled-default rollback. |
| `5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md` | Disabled subscription launch lifecycle adapter evidence for timeout, cancellation, cleanup, and terminal states without process launch. |
| `5-3-subscription-launch-workspace-output-and-session-contract.md` | Artifact-only workspace, session, environment, output, redaction, and retention contracts for subscription launch prep. |
| `5-2-subscription-launch-approval-binding-and-stale-rejection.md` | Launch approval binding fields and non-executing stale/missing approval rejection evidence. |
| `5-1-subscription-launch-settings-policy-and-target-registry.md` | Disabled-default subscription launch settings and target registry evidence separate from handoff packages. |
| `4-3-ollama-timeout-cancellation-and-attempt-evidence.md` | Ollama timeout, cancellation, terminal-state, retry, dashboard, and export evidence using no-call fixtures only. |
| `4-2-ollama-prompt-redaction-and-retention-contract.md` | Ollama prompt-source, rejected-source, redaction, retention, dashboard, and export evidence without raw prompt or completion retention. |
| `4-1-ollama-provider-settings-and-registry-gates.md` | Ollama-specific disabled-default settings, registry gate evidence, dashboard/report updates, and no-call fixture tests. |
| `3-65-runtime-review-evidence-links.md` | Runtime evidence review related report, document, and dashboard anchor links for queued work-item evidence review. |
| `3-64-development-runway-evidence-links.md` | Development runway related report, document, and dashboard anchor links for larger safe slice evidence review. |
| `3-63-development-runway-pr-batching-policy.md` | Development runway batching policy and checklist for larger reviewable PR slices. |
| `3-62-maintenance-readiness-evidence-links.md` | Maintenance readiness related report, document, and dashboard anchor links for safe-lane evidence review. |
| `3-61-maintenance-action-evidence-links.md` | Maintenance action plan related report and document links for safe-step evidence review. |
| `3-60-safe-backlog-report-anchors.md` | Safe backlog related-report links and dashboard anchors for faster read-only evidence navigation. |
| `3-59-development-runway-readiness-checks.md` | Development runway per-slice readiness checks for ready and blocked larger PR slice selection. |
| `3-58-verification-handoff-checkpoints.md` | Verification readiness handoff checkpoints for local delivery, dashboard changes, fresh-VM setup, and authority-boundary gates. |
| `3-57-work-item-review-queue-shortcuts.md` | Work-item evidence overview shortcuts for runtime evidence review queue position, evidence counts, recommended action, and controls-page review index navigation. |
| `3-56-verification-execution-plan-groups.md` | Verification readiness command groups for ordered setup, static drift, dashboard/browser, supervisor, full local, and optional remote checks. |
| `3-55-runtime-evidence-review-index.md` | Read-only runtime evidence review index for work-item exports, review priority, evidence counts, related reports, and safe review actions. |
| `3-54-development-runway-safe-slices.md` | Read-only development runway for grouping safe backlog, maintenance action, verification, and authority blocker evidence into larger PR-sized safe slices. |
| `3-53-authority-readiness-matrix-report.md` | Read-only authority readiness matrix for blocked execution-authority families, approval evidence, related reports, and stop lines. |
| `3-52-maintenance-action-plan-report.md` | Read-only maintenance action plan report for larger safe slices, verification commands, evidence links, and authority stop lines. |
| `3-51-process-lifecycle-policy-drift-check.md` | Dedicated static drift check for future process lifecycle policy and disabled launch evidence. |
| `3-50-provider-fixture-policy-drift-check.md` | Dedicated static drift check for disabled local-provider fixture policy alignment. |
| `3-49-execution-evidence-boundary-drift-check.md` | Dedicated static drift check for execution-state boundary and disabled-provider proof alignment. |
| `3-48-execution-boundary-report-drift-check.md` | Dedicated static drift check for execution configuration, execution readiness, and threat-boundary report alignment. |
| `3-47-core-readiness-drift-checks.md` | Dedicated static drift checks for documentation authority and verification readiness report alignment. |
| `3-46-maintenance-readiness-drift-check.md` | Dedicated static drift check for maintenance readiness report alignment across code, dashboard, tests, docs, and runbooks. |
| `3-45-delivery-readiness-policy-drift-check.md` | Dedicated static drift check for delivery readiness policy report alignment across code, dashboard, tests, docs, and runbooks. |
| `3-44-delivery-readiness-policy-report.md` | Read-only controls-page report for PR, CI, merge, and local-only waiver rules in managed recipe delivery readiness. |
| `3-43-safe-delivery-hygiene.md` | Safe backlog delivery-hygiene item for Git/GCM, Codex connector, larger PR slices, and plaintext-token stop lines. |
| `3-42-github-workflow-policy-report.md` | Read-only controls-page report for Git/GCM, Codex GitHub connector, optional gh auth, and plaintext-token stop lines. |
| `3-41-current-gap-review-refresh.md` | Current gap review and continuation handoff refresh with static documentation drift coverage. |
| `3-40-runtime-report-anchor-links.md` | Runtime evidence export related reports use shared controls-page report anchor links. |
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

## Draft Epic 6 Stories

| Story | Slice |
| --- | --- |
| `6-2-epic-6-product-architecture-consolidation.md` | Consolidate the integrated Epic 6 product direction across product brief, PRD, architecture, story map, Dev Console, BMAD intake, progressive authority, Git/GitHub hygiene, and startup requirements. |
| `6-3-candidate-work-model-api.md` | Add the lightweight persisted Candidate Work model and supervisor API for proposed work before Active Dev Console promotion. |
| `6-4-bmad-import-package-parser.md` | Convert local BMAD/story markdown artifacts into safe Candidate Work import packages without execution. |
| `6-5-proposed-work-dev-console-view.md` | Add the Dev Console Proposed Work surface for reviewing Candidate Work before activation. |
| `6-6-candidate-priority-order-promote.md` | Add priority/order controls and Candidate Work promotion into Active Dev Console work without execution. |
| `6-7-task-packet-v0-orchestrated-preview.md` | Build minimal Task Packet v0 from Active work and record preview-only orchestrator lane decisions. |
| `6-8-execution-attempt-integration.md` | Attach Task Packet preview evidence to fake or blocked execution attempts without worker launch authority. |
| `6-9-dev-console-realtime-live-state.md` | Refresh Dev Console cards, counts, attempts, and evidence from supervisor SSE events without polling or full reloads. |
| `6-10-synthetic-bmad-proof.md` | Prove a synthetic BMAD artifact can flow through Candidate Work, Active Work, routing preview, and fake/blocked attempt evidence. |
| `6-11-real-bmad-story-proof.md` | Prove a real existing BMAD story can preserve metadata through Candidate Work, Active Work, Task Packet, attempt, and runtime evidence. |
| `6-12-startup-availability.md` | Verify Windows logon startup tasks and live Dashboard/Supervisor endpoints for Dev Console availability. |
| `6-13-safe-local-execution.md` | Add a work-item Local check panel that records local read-only evidence explanations while preserving disabled write, command, worker, Git, and provider expansion boundaries. |
| `6-14-git-hygiene-read-only.md` | Add a read-only Git hygiene report and Dev Console panel for repository, worktree, branch, PR, and CI posture without remote writes or cleanup. |
| `6-15-local-worktree-management.md` | Add a guarded local worktree plan for managed work items without creating, removing, or cleaning up local worktrees. |
| `6-16-codex-readiness-no-launch.md` | Add a no-launch Codex readiness report for CLI discovery, auth-check posture, worker-launch stop lines, and source-mutation boundaries. |
| `6-17-codex-implementation-approval-packet.md` | Add a read-only approval packet for future bounded Codex implementation with target scope, path boundaries, command shape, evidence, rollback, and stop conditions. |
| `6-18-claude-readiness-no-launch.md` | Add a no-launch Claude review readiness report for CLI discovery, review-only posture, scarce-use policy, and source-mutation boundaries. |
| `6-19-claude-review-approval-packet.md` | Add a read-only approval packet for future bounded Claude review with trigger policy, context scope, blocked inputs, output contract, and scarcity controls. |
| `6-20-github-delivery-authority-ladder.md` | Add a read-only GitHub delivery authority ladder for push, PR, CI, review resolution, merge, and remote cleanup approvals. |
| `6-21-local-cleanup-readiness.md` | Add a read-only local cleanup readiness report for completed, stale, and abandoned worktree cleanup policy before deletion is enabled. |
| `6-22-remote-cleanup-sync-readiness.md` | Add a read-only remote cleanup and issue/story sync readiness report before remote deletion or GitHub status updates are enabled. |
| `6-23-trusted-autonomy-readiness.md` | Add a read-only trusted autonomy readiness report for low-risk workflow graduation gates before autonomous execution is enabled. |
| `6-24-epic-6-completion-audit.md` | Add a read-only Dev Console audit showing Epic 6 completion evidence, remaining authority blockers, and the next delivery approval needed. |
| `6-25-trusted-delivery-eligibility-policy.md` | Add read-only trusted delivery eligibility stages for softening push, PR, merge, and cleanup blockers only after strict evidence is satisfied. |

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
