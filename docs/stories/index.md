# Story Index

Date: 2026-06-14
Status: current navigation index

## Post-Epic-6 Status Reconciliation

Epics 3, 4, 5, and 6 have been reconciled after Epic 6 MVP completion.

- Epic 3 readiness, maintenance, verification, report, and evidence-link stories are closed as delivered story evidence.
- Epic 4 Ollama/provider stories are closed within their approved scope: Stories 4.1-4.3 are non-executing preparation, and Story 4.4 is limited to the approved VM-to-host Ollama endpoint/model boundary.
- Epic 5 subscription-launch stories are closed for non-executing preparation through Story 5.4. Story 5.5 remains deferred post-MVP until Bob accepts an exact supervised process-launch approval for a concrete target/scope.
- Epic 6 MVP is complete through Story 3.66 and PR #98. Story 6.1 is done for the fake-worker spike; real Codex/Claude process launch remains a post-MVP authority gate until Bob accepts an exact worker-launch approval for a concrete target/scope.

## Blocked Pending Explicit Approval

These stories must not be implemented for real execution until the operator explicitly approves the named authority and concrete scope. Approval packets now exist for the major authority lanes, but the packets are non-executing and approval-required.

### Orchestrator CLI Worker Launch

Story 6.1 is complete for the fake-worker spike. It remains listed here only because real Codex CLI process launch and real Claude Code CLI process launch are still blocked pending explicit post-MVP approval.

- `6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`

### Ollama Local Provider

No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model. Any endpoint, model, provider, or retention expansion still requires explicit successor approval.

### Subscription-Agent Launch

Stories 5.1-5.4 are complete as non-executing subscription-launch preparation. Story 5.5 remains deferred because it would cross into supervised process launch.

- `5-5-subscription-launch-supervised-process-behind-approval.md`

## Closed Epic 3-6 Story Evidence

## Current Authority Packets

The remaining authority lanes now have current non-executing approval packets:

- Adaptive scoring: `docs/goals/adaptive-scoring-approval-packet-2026-06-13.md`
- Local provider execution: `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- Premium execution: `docs/goals/premium-execution-approval-packet-2026-06-13.md`
- Real CLI worker launch: `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`
- Subscription-agent process launch: `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`
- Cleanup automation: `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`
- GitHub delivery evidence: `docs/goals/github-delivery-approval-packet-pr-103-2026-06-13.md` and `docs/goals/github-delivery-post-merge-cleanup-evidence-pr-103-2026-06-13.md`

Current audit: `docs/goals/gated-authority-backlog-completion-audit-2026-06-14.md`

## Selected Epic 6 MVP Proof Trial Story

| Story | Slice |
| --- | --- |
| `3-66-epic-6-mvp-proof-done-evidence.md` | Selected low-risk real BMAD story for proving the full Epic 6 MVP lifecycle from Candidate Work through Dev Console done evidence. |

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

## Closed Epic 6 Story Map

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
| `6-26-trusted-delivery-eligibility-evaluator.md` | Add a read-only evaluator for current-branch trusted delivery eligibility before any push, PR, merge, or cleanup action is allowed. |
| `6-27-epic-6-mvp-proof-trial-packet.md` | Add a read-only approval packet for the next real BMAD story proof trial across Codex, Claude, local/Ollama evidence, GitHub delivery, cleanup, and done evidence. |
| `6-27-epic-6-mvp-proof-trial-packet.md` | Add a read-only trial packet for the next real BMAD story proof approval without launching Codex, Claude, GitHub delivery, cleanup, or autonomy. |

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

Generic continuation language does not approve blocked post-MVP authority stories. Use `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md` before moving any blocked story to ready.

## Draft Epic 7 Story Map

Epic 7 starts after the Epic 6 retrospective. Its theme is useful supervised execution: prove one bounded Codex worker doing useful work before subscription-agent launch or broad autonomy.

| Story | Slice |
| --- | --- |
| `7-1-define-green-gate-delivery-readiness-contract.md` | Done first Epic 7 story defining the green-gate delivery readiness contract, negative fixtures, machine-checkable blocked reasons, and read-only authority boundary before mutating worker launch. |
| `7-2-define-bounded-codex-worker-launch-contract.md` | Done Codex launch authority envelope with stale/mismatch rejection and no-launch enforcement. |
| `7-3-block-out-of-scope-diffs-before-worker-mutation.md` | Done diff guard that blocks unexpected file changes before real worker mutation can become delivery-eligible. |
| `7-4-run-first-supervised-codex-worker-launch.md` | Done first real bounded Codex launch story, gated by explicit approval and prior diff guard. |
| `7-5-record-verification-results-and-recovery-evidence.md` | Done verification and recovery evidence story for supervised worker output. |
| `7-6-show-green-gate-readiness-in-dev-console.md` | Done Dev Console readiness view consuming real persisted green-gate evidence. |
| `7-7-compute-pr-merge-cleanup-eligibility-from-green-gate-evidence.md` | Done eligibility computation for PR, merge, and cleanup, reporting readiness without performing gated actions. |

## Draft Epic 8 Story Map

Epic 8 starts after the Epic 7 retrospective. Its theme is supervised subscription-agent launch: revive deferred Story 5.5 as a staged, approval-bound launch path while preserving the real-process stop line until a later exact approval packet is accepted.

Stories 8.1 through 8.6 are complete within their approved scope and remain below new direct process-launch, cleanup, GitHub, provider, credential, network, and source-mutation authority boundaries.

| Story | Slice |
| --- | --- |
| `8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md` | Done packet refresh that maps Epic 7 controls to the deferred subscription-agent launch gates without approving real process launch. |
| `8-2-define-first-launch-target-policy-and-execution-envelope.md` | Done policy story for first launch target, command template, environment allowlist, artifact limits, timeout/cancel policy, expiry, dashboard controls, rollback, and verification. |
| `8-3-implement-disabled-dry-run-process-supervisor-adapter.md` | Done disabled/dry-run adapter story for lifecycle, cancellation, timeout, output artifact, and rollback behavior before real launch. |
| `8-4-show-subscription-launch-readiness-in-dev-console.md` | Done Dev Console readiness story for subscription launch blocked states, dry-run evidence, missing approvals, and execution-prohibited display. |
| `8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md` | Done exact-approval artifact-only fixture launch story with retained metadata evidence and no broad authority expansion. |
| `8-6-record-verification-recovery-and-rollback-evidence.md` | Done evidence story for subscription-launch verification, recovery path, rollback state, retained artifact references, and next safe action. |

## Draft Epic 9 Story Map

| Story | Summary |
| --- | --- |
| `9-1-harden-static-drift-checks.md` | Done hardening story for runtime-evidence static drift checks with deterministic fixtures, structured or behavioral assertions, actionable failure output, and no authority expansion. |
| `9-2-clarify-subscription-launch-recordevent-mutation-semantics.md` | Done contract story for explicit, idempotent subscription launch `recordEvent` mutation semantics without launch retry or authority expansion. |
| `9-3-restore-provider-raw-output-ui-regression-coverage.md` | Done UI/report regression story for provider raw-output exclusion using deterministic local fixtures, API sanitization, and DOM/text-state assertions. |

## Draft Epic 10 Story Map

| Story | Summary |
| --- | --- |
| `10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md` | Done contract story for policy-bound low-risk delivery dry-run planning across PR, merge, and cleanup actions without remote mutation or destructive cleanup. |
| `10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md` | Done evidence story for approved PR and merge actions with metadata-only delivery results, stale-state rejection, exact policy identity, and retention-boundary enforcement. |
| `10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md` | Done cleanup planning story for preserving evidence, distinguishing Git worktrees from filesystem residue, source files, and blocked paths, and blocking ambiguous deletion. |
| `10-4-show-delivery-and-cleanup-plans-in-dev-console.md` | Done dashboard story for showing PR, merge, and cleanup plan states, dry-run effects, blocked reasons, retained evidence, and cleanup residue classification. |
| `10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md` | Done authority hardening story for validating delivery execution approval IDs against a trusted metadata-only approval ledger. |

## Draft Epic 11 Story Map

Epic 11 starts after the Epic 10 retrospective. Its theme is current-state reconciliation and next-lane authority planning: refresh stale planning/status artifacts after Epic 10 without granting provider, process-launch, premium, scoring, GitHub, cleanup, or broad automation authority.

| Story | Summary |
| --- | --- |
| `11-1-reconcile-planning-status-after-epic-10-delivery.md` | Done reconciliation story for aligning story, PRD, architecture, sprint, and PR-state claims with current implementation evidence. |
| `11-2-refresh-authority-readiness-matrix-from-current-evidence.md` | Done story for refreshing the authority readiness matrix with current delivery, cleanup, provider, process, premium, and scoring evidence without granting new authority. |
| `11-3-create-next-lane-authority-decision-packet.md` | Done story for creating a decision-only packet comparing the next candidate authority lanes without executing or approving any lane. |
| `11-4-show-reconciliation-and-next-lane-readiness-in-dev-console.md` | Done story for showing reconciliation state and next-lane readiness in the Dev Console without adding execution controls. |

## Draft Epic 12 Story Map

Epic 12 starts after Bob selected the `github-delivery` deferred authority lane. Its theme is GitHub delivery approval and current PR evidence: refresh PR #103 delivery evidence and approval requirements before any merge or remote mutation is requested.

Stories in this epic do not approve push, PR mutation, merge, deploy, branch deletion, worktree deletion, cleanup, issue sync, credential access, failed-check bypass, or worker remote automation.

| Story | Summary |
| --- | --- |
| `12-1-refresh-github-delivery-approval-packet-from-current-pr-evidence.md` | Done story for refreshing the PR #103 GitHub delivery approval packet from current PR, CI, review, mergeability, retained-evidence, rollback, and stop-line evidence without performing delivery. |
| `12-2-record-post-merge-delivery-and-cleanup-evidence.md` | Done story for recording PR #103 merge evidence, remote branch cleanup, remote-tracking prune, registered worktree state, and preserved cleanup stop lines after delivery. |

## Draft Epic 13 Story Map

Epic 13 starts after the GitHub delivery lane was merged and cleaned up. Its theme is adaptive scoring as bounded decision support: define and later prove scoring only as metadata-only, human-reviewed recommendation evidence without priority mutation, authority changes, provider calls, or autopromotion.

Stories in this epic do not approve scoring execution, provider-backed scoring, priority mutation, candidate promotion, authority state changes, launch, delivery, cleanup, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `13-1-define-adaptive-scoring-decision-support-contract.md` | Done story for defining the adaptive-scoring approval packet, allowed metadata inputs, deterministic formula requirements, output-use policy, approval binding, rollback/removal path, and stop lines without computing or applying a score. |

## Draft Epic 14 Story Map

Epic 14 starts after the adaptive-scoring contract packet. Its theme is local provider execution approval readiness: refresh the existing Story 4.4 Ollama endpoint/model boundary into an exact approval packet before any future provider call.

Stories in this epic do not approve provider calls, endpoint/model discovery, broader provider expansion, raw provider-output retention, credential access, source mutation, launch, delivery, cleanup, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `14-1-refresh-local-provider-execution-approval-packet.md` | Done story for refreshing the local-provider execution approval packet for the approved Ollama endpoint `http://192.168.1.128:11434/v1/chat/completions`, model `qwen3:14b`, metadata-only retention, rollback, and stop lines without calling a provider. |
| `14-2-pin-local-provider-approval-packet-to-drift-checks.md` | Review story for pinning the local-provider approval packet to no-call drift checks across packet, settings, service gate, and integration-test evidence without calling Ollama. |
| `14-3-implement-bounded-local-ollama-provider-runtime.md` | Done story for requiring an exact local-provider approval instance before the existing Ollama adapter can perform one bounded metadata-only provider call. |

## Draft Epic 15 Story Map

Epic 15 starts after the local-provider approval packet. Its theme is premium execution approval readiness: define the cost, provider/account, data, audit, retained-evidence, abort, rollback, and stop-line requirements before any paid provider call.

Stories in this epic do not approve paid provider calls, credential/session access, raw prompt/completion/provider payload retention, budget-incurring behavior, source mutation, launch, delivery, cleanup, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `15-1-refresh-premium-execution-approval-packet.md` | Done story for refreshing the premium-execution approval packet with provider/account boundary, cost ceiling, data classification, audit evidence, retained evidence, abort policy, rollback path, and stop lines without making a paid call. |
| `15-2-pin-premium-execution-approval-packet-to-drift-checks.md` | Review story for pinning the premium execution approval packet to no-cost drift checks across packet, settings, service gate, and integration-test evidence without making a paid call. |

## Draft Epic 16 Story Map

Epic 16 starts after the premium-execution approval packet. Its theme is subscription-agent process-launch authority: first refresh and pin the deferred Story 5.5 direct-launch envelope from current Epic 8 evidence without launching a real process, then add an explicitly bounded runtime path behind exact process-launch approval.

Stories 16.1 and 16.2 do not approve process launch, shell expansion, credential/session inheritance, provider calls, source mutation, generated patch application, issue sync, PR delivery, cleanup, or failed-check bypass. Runtime stories in this epic must preserve those denials except for the one explicitly approved supervised launch operation they implement.

| Story | Summary |
| --- | --- |
| `16-1-refresh-subscription-agent-process-launch-approval-packet.md` | Done story for refreshing the subscription-agent process-launch approval packet with workspace, command, environment, lifecycle, output, retention, verification, rollback, and stop-line requirements without launching a process. |
| `16-2-pin-subscription-agent-process-launch-packet-to-drift-checks.md` | Review story for pinning the subscription-agent process-launch approval packet to no-launch drift checks across packet, settings, service gate, and integration-test evidence without launching a process. |
| `16-3-implement-bounded-subscription-agent-supervised-runtime.md` | Done story for requiring a server-accepted exact subscription-agent process-launch approval instance before any bounded supervised runtime adapter can start a process. |

## Draft Epic 17 Story Map

Epic 17 starts after the subscription-agent process-launch approval packet. Its theme is real CLI worker launch approval readiness: refresh the deferred Codex/Claude real-process launch envelope from fake-worker and Epic 7 evidence without launching a worker.

Stories in this epic do not approve Codex launch, Claude launch, shell execution, source mutation, credential/session access, PR delivery, cleanup, issue sync, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `17-1-refresh-real-cli-worker-launch-approval-packet.md` | Done story for refreshing the real CLI worker launch approval packet with tool identity, command, file scope, mutation permission, retention, verification, review, rollback, and stop-line requirements without launching Codex or Claude. |
| `17-2-pin-real-cli-worker-launch-packet-to-drift-checks.md` | Review story for pinning the real CLI worker launch approval packet to no-launch drift checks across packet, settings, service readiness, and integration-test evidence without launching Codex or Claude. |

## Draft Epic 18 Story Map

Epic 18 starts after the real CLI worker launch approval packet. Its theme is cleanup automation approval readiness: refresh the target-specific deletion/removal approval envelope from current cleanup planning evidence without deleting anything.

Stories in this epic do not approve file deletion, worktree removal, branch deletion, remote ref deletion, retained evidence deletion, cleanup commands, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `18-1-refresh-cleanup-automation-approval-packet.md` | Done story for refreshing the cleanup automation approval packet with target classification, approved-root proof, retained evidence, delivery evidence, dry-run effects, operation shape, rollback, and stop lines without deleting anything. |
| `18-2-pin-cleanup-automation-packet-to-drift-checks.md` | Review story for pinning the cleanup automation approval packet to no-deletion drift checks across packet, cleanup planning service, delivery-readiness checks, and integration-test evidence without deleting anything. |

## Draft Epic 19 Story Map

Epic 19 records the gated authority backlog completion audit after approval packets were created and merged for the deferred lanes.

Stories in this epic do not approve or execute provider calls, paid calls, process launches, worker launches, source mutation, cleanup deletion, branch/ref deletion, issue sync, PR delivery, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `19-1-record-gated-authority-backlog-completion-audit.md` | Done story for recording the safe-prep completion audit and clarifying that execution remains blocked until exact target-specific approval is accepted. |


## Draft Epic 20 Story Map

Epic 20 starts after Bob selected the dashboard's primary mode as monitoring. Its theme is a monitoring-first dashboard home: Mission Control overview, attention queue, live activity, and read-only evidence drill-in before command or mutation controls.

Stories in this epic do not approve or execute provider calls, paid calls, process launches, worker launches, source mutation, cleanup deletion, branch/ref deletion, issue sync, PR delivery, retry automation, approval automation, or failed-check bypass.

| Story | Summary |
| --- | --- |
| `20-1-monitoring-dashboard-home.md` | Done story for recomposing the dashboard home into a monitoring-first Mission Control surface while preserving existing detail/control pages and authority boundaries. |
## Draft Epic 21 Story Map

Epic 21 starts from the token-economy brainstorming lane. Its theme is reducing token waste across Kendall_Nxt agents and workflows while preserving visible progress, plain-English explanations, safety gates, evidence, and Bob steering points.

Stories in this epic do not approve provider calls, paid usage, compression-layer adoption, process launch, worker launch, credential/session access, GitHub mutation, cleanup, or broad automation.

| Story | Summary |
| --- | --- |
| `21-1-token-economy-foundation.md` | Done story for quiet competent operator behavior, plain-English escalation, Tool Churn RCA workflow, AI context entry map, usage measurement plan, and compression-tool evaluation gates without adopting external tools. |
| `21-2-operationalize-token-economy-workflow.md` | Done story for operational Tool Churn RCA examples and a token-economy drift check wired into repo verification. |
| `21-3-harden-tool-churn-rca-drift-check.md` | Done story for pinning Tool Churn RCA trigger conditions, failure classes, retry stop lines, next safe actions, and non-goals in the token-economy drift check. |
| `21-4-token-economy-measurement-readiness.md` | Done story for baseline measurement packets, workflow samples, and adoption gates before token-savings claims or external tool adoption. |

## Draft Epic 22 Story Map

Epic 22 focuses on coordination for concurrent Codex development lanes, especially when PRs, merge gates, local-only commits, and active managed worktrees coexist.

Stories in this epic do not approve PR merges, cleanup, branch deletion, local commit discard, provider calls, paid usage, worker launch, process launch, credential/session access, or execution authority.

| Story | Summary |
| --- | --- |
| `22-1-workspace-coordination-report.md` | Done story for a workspace coordination report workflow and drift check that classifies active lanes, merge gates, local-only commits, cleanup candidates, and stop lines. |
| `22-2-evaluate-mise-managed-worktree-readiness.md` | Done evaluation story with baseline and controlled `mise` trial evidence; its deferred-adoption decision was superseded by Story 22.3 after clean post-merge validation. |
| `22-3-implement-mise-normal-workflow.md` | Done story for implementing tracked `mise.toml` as the normal supported local readiness workflow while delegating to existing package scripts and preserving stop lines. |
