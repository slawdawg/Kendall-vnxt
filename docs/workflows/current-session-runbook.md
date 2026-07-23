# Current Session Runbook

This is the stable first-read pointer for any Codex session starting in this
repo.

Read these first:

```text
AGENTS.md
docs/ai-context/index.md
docs/workflows/linux-primary-development-runbook.md
docs/workflows/planning-doc-clean-install-boundary.md
docs/workflows/alpha-daily-use-runbook.md
docs/workflows/cockpit-autostart-runbook.md
docs/workflows/branch-foundation-setup.md
```

Then use these navigation indexes before starting architecture, PRD, story, or
execution-authority work:

```text
docs/architecture/index.md
docs/workflows/product-requirements-boundary.md
docs/workflows/implementation-evidence-boundary.md
```

Recommended prompt:

```text
Read AGENTS.md and docs/workflows/current-session-runbook.md, then continue from the repo state as source of truth.
```

Local continuity artifacts, dated handoffs, and BMAD work products are not part
of the GitHub clean-install surface. Keep them under `_bmad-output/` or another
ignored local workspace path. If their decisions need to survive in Git, rewrite
the decision as source-owned docs, scripts, tests, or policy.

This runbook also anchors runbook verification for the active check chain.
Prepared lane handoffs must surface a resume packet with owner, branch,
worktree/dirty state, readiness status, next command, and takeover stop lines
through the runner assignment status report before another runner continues or
asks for takeover.
Autonomous best-judgment choices must be recorded through metadata-only heartbeat decision evidence.
Include the decision, rationale, and next safe action before the runner continues.

## Optional local Ollama review lane

The approved LAN route is `http://192.168.1.128:11434/v1/chat/completions` using
`qwen3:14b`, from the current VM source `192.168.1.8`. Ollama must be running on
the host and reachable on TCP port `11434` before enabling the lane. The
supervisor enables the exact local Ollama gates by default in this local profile.
Automatic local-policy consent replaces a per-call operator prompt for this
local-only explanation capability; it is separate from the Claude-primary,
Ollama-backup review route and never fabricates a Claude fallback. The exact
route, metadata-only boundary, redaction, size, timeout, and rollback guards
remain mandatory. Set the two `SUPERVISOR_ALLOW_*` gates or
`SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE` to `false` to disable it:

```bash
export SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS=false
export SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS=false
export SUPERVISOR_OLLAMA_ENDPOINT_URL=http://192.168.1.128:11434/v1/chat/completions
export SUPERVISOR_OLLAMA_MODEL_ID=qwen3:14b
export SUPERVISOR_OLLAMA_APPROVED_SOURCE_VM=192.168.1.8
```

The local evidence explanation endpoint can run under the automatic policy when
the request records its workflow event. Response bodies, prompts, completions,
and reasoning are not retained. Disable the gates or automatic policy flag to
roll back the lane.

Run `pnpm run check:fast` before long local or CI-style gates when changes touch
workflow policy, workspace delivery, sandbox-boundary handling, anti-churn
routing, dashboard E2E runners, or manager-control-plane verification. Use
`pnpm run check:ci-fast`, `pnpm run check:workspace-fast`,
`pnpm run check:sandbox-fast`, or `pnpm run check:dashboard-fast` for a narrower
first pass when only one surface changed.

`pnpm run check` includes `pnpm run check:docs`,
`pnpm run check:fast`,
`pnpm run test:check-plan`,
`pnpm run test:supervisor-runner`,
`pnpm run test:supervisor:review-route`,
`pnpm run test:static-bundles`,
`pnpm run test:review-gated-low-risk-automation`,
`pnpm run test:review-gated-low-risk-fake-adapter`,
`pnpm run test:review-gated-low-risk-dry-run-adapter`,
`pnpm run test:review-gated-low-risk-read-only-review`,
`pnpm run test:review-gated-low-risk-bounded-write`,
`pnpm run test:review-gated-low-risk-pilot-admission`,
`pnpm run test:review-gated-low-risk-policy-eligibility`,
`pnpm run test:review-gated-low-risk-route-policy`,
`pnpm run test:metadata-only-provider-result`,
`pnpm run test:private-evidence-packet-policy`,
`pnpm run test:static-bundle-summary`,
`pnpm run check:governed-worker-execution-dry-run`,
`pnpm run check:documentation-authority`,
`pnpm run check:legacy-planning-inventory`,
`pnpm run check:review-resource-policy`,
`pnpm run check:verification-readiness`,
`pnpm run check:pipeline-implementation-readiness`,
`pnpm run check:dashboard-pipeline-boundary`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:authority-readiness`,
`pnpm run check:branch-protection-readiness`,
`pnpm run check:adaptive-scoring`,
`pnpm run check:premium-execution`, `pnpm run check:worker-launch`,
`pnpm run check:e2e-report`,
`pnpm run check:reports`, `pnpm run check:execution-boundary`,
`pnpm run check:execution-evidence`, `pnpm run check:provider-fixtures`,
`pnpm run check:process-lifecycle`, `pnpm run check:runbooks` for runbook
verification, `pnpm run check:runtime-export`, `pnpm run check:runtime-review`,
`pnpm run check:safe-backlog`, `pnpm run check:managed-recipes`,
`pnpm run check:maintenance-action-plan`, `pnpm run check:development-runway`,
`pnpm run check:runner-assignment-status`,
`pnpm run test:manager-quality-gate`,
`pnpm run test:manager-control-plane:contracts`,
`pnpm run test:manager-control-plane:focused`,
`pnpm run test:manager-control-plane`,
`pnpm run test:manager-control-plane-contract`,
`pnpm run test:manager-control-plane-dispatcher-port`,
`pnpm run test:manager-control-plane-forbidden-boundary`,
`pnpm run test:manager-control-plane-run-contract`,
`pnpm run test:manager-worker-clean-cycle-observer`,
`pnpm run check:manager-control-plane`,
`pnpm run check:manager-lifecycle-status-parity`,
`pnpm run test:runner-handoff-audit-json-validation`,
`pnpm run check:delivery-readiness`,
`pnpm run check:github-workflow-policy`,
`pnpm run check:cleanup-automation`,
`pnpm run check:maintenance-readiness`, `pnpm run check:token-economy`,
`pnpm run check:workspace-coordination`,
`pnpm run test:tmux-orientation-report`,
`pnpm run check:tmux-orientation-report`, `pnpm run check:mise-workflow`,
`pnpm run check:linux-install-lane`, `pnpm run check:bmad-work-products`,
`pnpm run check:knx-obsidian-memory`,
`pnpm run test:clean-install-boundary`, `pnpm run test:knx-obsidian-memory`,
`pnpm run test:work-packet-contracts`, `pnpm run test:work-packet-stage-map`,
`pnpm run test:work-packet-fixtures`, `pnpm run test:pipeline-state-matrix`,
`pnpm run test:dashboard-pipeline-fixtures`,
`pnpm run test:dashboard-memory-proposals`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:clean-install-boundary`,
`pnpm run test:codex-workspace`, `pnpm run test:sandbox-boundary-classifier`,
`pnpm run test:codex-workspace-state`,
`pnpm run test:workspace-command-resolution`,
`pnpm run test:anti-churn-event-writer`,
`pnpm run test:anti-churn-signature-classifier`,
`pnpm run test:anti-churn-event-reader`,
`pnpm run test:anti-churn-guidance-candidate-classifier`,
`pnpm run test:anti-churn-guidance-dedupe`,
`pnpm run test:anti-churn-guidance-output`,
`pnpm run test:anti-churn-verification-routing`,
`pnpm run test:anti-churn-apply-safe-gate`,
`pnpm run test:anti-churn-hook-transaction-store`,
`pnpm run test:anti-churn-source-apply`,
`pnpm run test:anti-churn-verification-rollback`,
`pnpm run test:dashboard-e2e-runner`, `pnpm run build:dashboard`,
`pnpm run test:supervisor-runner`, `pnpm run test:supervisor:review-route`, and
`pnpm run test:supervisor`.

`pnpm run test:supervisor:review-route` is the focused report-only Disclosure
Packet parity check. It validates no-provider route behavior without calling a
provider, invoking an adapter, or granting execution authority.
