# Implementation Evidence Boundary

This workflow contract is the Git-backed source of truth for implementation evidence anchors that must survive a clean install. It replaces local BMAD story files and the story index as active verification sources. Local BMAD stories, story maps, sprint artifacts, and story evidence packets are workspace artifacts and must remain local-only.

Self path: `docs/workflows/implementation-evidence-boundary.md`

Generic continuation language does not approve blocked post-MVP authority stories. Use `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md` and `docs/workflows/execution-authority-boundary.md` before moving any blocked execution-authority lane to ready.

## Blocked Authority Evidence

- Orchestrator CLI worker launch: Story 6.1 is complete for the fake-worker spike, but real Codex CLI process launch and real Claude Code CLI process launch remain blocked pending exact post-MVP approval.
- Ollama local provider: no currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model; any endpoint, model, provider, or retention expansion requires explicit successor approval.
- Subscription-agent launch: Stories 5.1-5.4 are complete as non-executing preparation; Story 5.5 remains deferred because it crosses into supervised process launch.

Local provider execution: `docs/workflows/execution-authority-boundary.md#local-provider-execution-contract`

No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model.

Any endpoint, model, provider, or retention expansion still requires explicit successor approval.

Subscription-agent process launch: `docs/workflows/execution-authority-boundary.md#subscription-agent-launch-contract`

Epic 16 starts after the premium-execution approval packet.

Stories 16.1 and 16.2 do not approve process launch, shell expansion, credential/session inheritance, provider calls, source mutation, generated patch application, issue sync, PR delivery, cleanup, or failed-check bypass.

Runtime stories in this epic must preserve those denials except for the one explicitly approved supervised launch operation they implement.

This story intentionally stops before real subscription-agent process launch.

It explicitly keeps production/direct process launch blocked until the operator accepts the exact future launch approval.

Preserve Story 8.5 as artifact-only fixture evidence, not production process-launch approval.

Premium execution: `docs/workflows/execution-authority-boundary.md#premium-execution-contract`

Epic 15 starts after the local-provider approval packet.

Stories in this epic do not approve paid provider calls, credential/session access, raw prompt/completion/provider payload retention, budget-incurring behavior, source mutation, launch, delivery, cleanup, or failed-check bypass.

This story intentionally stops before premium execution.

Preserved Story 1.18 premium approval artifacts as request-only evidence.

Defined cost ceiling, data classification, audit evidence, abort, rollback, and stop-line requirements before any paid operation.

Real CLI worker launch: `docs/workflows/execution-authority-boundary.md#worker-process-launch-contract`

Epic 17 starts after the subscription-agent process-launch approval packet.

Stories in this epic do not approve Codex launch, Claude launch, shell execution, source mutation, credential/session access, PR delivery, cleanup, issue sync, or failed-check bypass.

This story intentionally stops before real Codex CLI or Claude Code CLI launch.

Do not launch Codex.

Do not launch Claude.

Do not run shell commands as a worker.

Do not mutate source.

Do not deliver PRs or cleanup from worker authority.

Cleanup automation: `docs/workflows/execution-authority-boundary.md#cleanup-automation-contract`

Epic 18 starts after the real CLI worker launch approval packet.

Stories in this epic do not approve file deletion, worktree removal, branch deletion, remote ref deletion, retained evidence deletion, cleanup commands, or failed-check bypass.

This story is non-executing.

this story is non-executing

It does not delete paths, remove worktrees, delete branches, delete remote refs, remove evidence, or run cleanup commands.

Preserved cleanup planning as read-only evidence and required target-specific approval before any deletion.

Blocked local-only story identifiers preserved as evidence labels:

- `6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`
- `5-5-subscription-launch-supervised-process-behind-approval.md`

## Authority And Delivery Evidence

The following implementation evidence labels are source-owned anchors for runtime reports and drift checks. They are labels only, not required Git-tracked story files.

- `10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`
- `11-2-refresh-authority-readiness-matrix-from-current-evidence.md`
- `12-1-refresh-github-delivery-approval-packet-from-current-pr-evidence.md`
- `12-2-record-post-merge-delivery-and-cleanup-evidence.md`
- `13-1-define-adaptive-scoring-decision-support-contract.md`
- `23-1-branch-protection-readiness-packet.md`
- `14-1-refresh-local-provider-execution-approval-packet.md`
- `14-2-pin-local-provider-approval-packet-to-drift-checks.md`
- `14-3-implement-bounded-local-ollama-provider-runtime.md`
- `15-1-refresh-premium-execution-approval-packet.md`
- `16-3-implement-bounded-subscription-agent-supervised-runtime.md`
- `17-1-refresh-real-cli-worker-launch-approval-packet.md`
- `18-1-refresh-cleanup-automation-approval-packet.md`
- `19-1-record-gated-authority-backlog-completion-audit.md`

## Core Runtime Evidence

Completed foundation evidence includes execution attempts, lifecycle, approval binding, workspace isolation, dashboard attempt evidence, configuration checks, runtime exports, and threat boundary.

- `2-7-runtime-evidence-export-strategy.md`
- `3-7-execution-readiness-and-evidence-report.md`
- `3-8-queue-attempt-boundary-and-provider-proofs.md`
- `3-17-dashboard-e2e-reliability-guardrails.md`
- `3-20-runtime-evidence-review-manifest.md`
- `3-21-dashboard-detail-e2e-runner.md`
- `3-22-dashboard-e2e-report.md`
- `3-23-dashboard-e2e-runner-lifecycle-helper.md`
- `3-24-dashboard-mobile-e2e-runner.md`
- `3-25-managed-recipe-e2e-runners.md`
- `3-26-dashboard-e2e-report-drift-check.md`
- `3-27-safe-development-backlog-report.md`
- `3-28-supervisor-report-catalog-drift-check.md`
- `3-29-runbook-verification-alignment.md`
- `3-30-runtime-evidence-review-navigator.md`
- `3-31-runtime-evidence-export-drift-check.md`
- `3-32-safe-development-backlog-drift-check.md`
- `3-33-evidence-overview-review-shortcuts.md`
- `3-34-report-shortcuts-in-evidence-overview.md`
- `3-35-runbook-check-chain-hardening.md`
- `3-36-managed-recipe-policy-report.md`
- `3-37-managed-recipe-policy-drift-check.md`
- `3-38-runbook-managed-recipe-check-chain.md`
- `3-39-report-shortcut-anchor-polish.md`
- `3-40-runtime-report-anchor-links.md`
- `3-42-github-workflow-policy-report.md`
- `3-43-safe-delivery-hygiene.md`
- `3-44-delivery-readiness-policy-report.md`
- `3-45-delivery-readiness-policy-drift-check.md`
- `3-46-maintenance-readiness-drift-check.md`
- `3-47-core-readiness-drift-checks.md`
- `3-48-execution-boundary-report-drift-check.md`
- `3-49-execution-evidence-boundary-drift-check.md`
- `3-50-provider-fixture-policy-drift-check.md`
- `3-51-process-lifecycle-policy-drift-check.md`
- `3-52-maintenance-action-plan-report.md`
- `3-53-authority-readiness-matrix-report.md`
- `3-54-development-runway-safe-slices.md`
- `3-55-runtime-evidence-review-index.md`
- `3-56-verification-execution-plan-groups.md`
- `3-57-work-item-review-queue-shortcuts.md`
- `3-58-verification-handoff-checkpoints.md`
- `3-59-development-runway-readiness-checks.md`
- `3-60-safe-backlog-report-anchors.md`
- `3-61-maintenance-action-evidence-links.md`
- `3-62-maintenance-readiness-evidence-links.md`
- `3-63-development-runway-pr-batching-policy.md`
- `3-64-development-runway-evidence-links.md`
- `3-65-runtime-review-evidence-links.md`
- `9-3-restore-provider-raw-output-ui-regression-coverage.md`
- `3-66-epic-6-mvp-proof-done-evidence.md`

## Provider And Process Evidence

- `3-10-provider-fixtures-and-ollama-prd-draft.md`
- `3-12-subscription-agent-launch-prd.md`
- `4-1-ollama-provider-settings-and-registry-gates.md`
- `4-2-ollama-prompt-redaction-and-retention-contract.md`
- `4-3-ollama-timeout-cancellation-and-attempt-evidence.md`
- `4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `5-1-subscription-launch-settings-policy-and-target-registry.md`
- `5-2-subscription-launch-approval-binding-and-stale-rejection.md`
- `5-3-subscription-launch-workspace-output-and-session-contract.md`
- `5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
- `8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
- `8-2-define-first-launch-target-policy-and-execution-envelope.md`
- `8-3-implement-disabled-dry-run-process-supervisor-adapter.md`
- `8-4-show-subscription-launch-readiness-in-dev-console.md`
- `8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `8-6-record-verification-recovery-and-rollback-evidence.md`

## Epic 6 Operational Evidence

- `6-14-git-hygiene-read-only.md`
- `6-16-codex-readiness-no-launch.md`
- `6-17-codex-implementation-approval-packet.md`
- `6-18-claude-readiness-no-launch.md`
- `6-19-claude-review-approval-packet.md`
- `6-20-github-delivery-authority-ladder.md`
- `6-21-local-cleanup-readiness.md`
- `6-22-remote-cleanup-sync-readiness.md`
- `6-23-trusted-autonomy-readiness.md`
- `6-26-trusted-delivery-eligibility-evaluator.md`
- `6-27-epic-6-mvp-proof-trial-packet.md`

## Token Economy And Workspace Evidence

- `21-1-token-economy-foundation.md`
- `21-2-operationalize-token-economy-workflow.md`
- `21-3-harden-tool-churn-rca-drift-check.md`
- `21-4-token-economy-measurement-readiness.md`
- `22-1-workspace-coordination-report.md`
- `22-2-evaluate-mise-managed-worktree-readiness.md`
- `22-3-implement-mise-normal-workflow.md`

Story 21.2 evidence preserves Tool Churn RCA guidance to become a directly usable workflow, static drift check verifies coverage, `docs/workflows/tool-churn-rca-examples.md`, does not install external token tools, and `pnpm run check:token-economy`.

Story 21.3 evidence preserves trigger conditions, failure classes, retry stop lines, next safe actions, non-goals, and `pnpm run check:token-economy`.

Story 21.4 evidence preserves baseline packet captures workflow type, keeps them evaluation-only, does not install tools, call providers, spend money, and `pnpm run check:token-economy`.

Story 22.1 evidence preserves that multiple managed worktrees are active, cleanup dry-run and a narrow approval packet, starting a non-overlapping managed worktree, `pnpm run check:workspace-coordination`, and does not merge PRs, clean worktrees, delete branches.

Story 22.3 evidence status: Status: done. It preserves `mise.toml` normal workflow evidence.

## Local-Only Story Artifacts

The labels above may appear in runtime evidence, tests, and drift checks as historical implementation identifiers. They must not require tracked files under `docs/stories/**`. When a check needs durable story-derived evidence, validate this workflow contract or a more specific source-owned workflow contract instead.
