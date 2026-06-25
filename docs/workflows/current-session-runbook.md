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

`pnpm run check` includes `pnpm run check:docs`,
`pnpm run check:documentation-authority`,
`pnpm run check:verification-readiness`,
`pnpm run check:pipeline-implementation-readiness`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:authority-readiness`, `pnpm run check:adaptive-scoring`,
`pnpm run check:premium-execution`, `pnpm run check:worker-launch`,
`pnpm run check:e2e-report`,
`pnpm run check:reports`, `pnpm run check:execution-boundary`,
`pnpm run check:execution-evidence`, `pnpm run check:provider-fixtures`,
`pnpm run check:process-lifecycle`, `pnpm run check:runbooks` for runbook
verification, `pnpm run check:runtime-export`, `pnpm run check:runtime-review`,
`pnpm run check:safe-backlog`, `pnpm run check:managed-recipes`,
`pnpm run check:maintenance-action-plan`, `pnpm run check:development-runway`,
`pnpm run check:runner-assignment-status`,
`pnpm run test:runner-handoff-audit-json-validation`,
`pnpm run check:delivery-readiness`,
`pnpm run check:github-workflow-policy`,
`pnpm run check:cleanup-automation`,
`pnpm run check:maintenance-readiness`, `pnpm run check:token-economy`,
`pnpm run check:workspace-coordination`, `pnpm run check:mise-workflow`,
`pnpm run check:linux-install-lane`, `pnpm run check:bmad-work-products`,
`pnpm run check:knx-obsidian-memory`,
`pnpm run test:clean-install-boundary`, `pnpm run test:knx-obsidian-memory`,
`pnpm run test:work-packet-contracts`, `pnpm run test:work-packet-stage-map`,
`pnpm run test:work-packet-fixtures`, `pnpm run test:pipeline-state-matrix`,
`pnpm run test:dashboard-pipeline-fixtures`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:clean-install-boundary`,
`pnpm run test:codex-workspace`, `pnpm run test:codex-workspace-state`,
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
`pnpm run test:dashboard-e2e-runner`, `pnpm run build:dashboard`, and
`pnpm run test:supervisor`.
