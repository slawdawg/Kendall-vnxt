# Current Codex Handoff

This is the stable handoff pointer for any Codex session starting in this repo.

Read this first:

```text
docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md
```

Then use these navigation indexes before starting architecture, PRD, story, or execution-authority work:

```text
docs/architecture/index.md
docs/prds/index.md
docs/stories/index.md
```

Recommended prompt:

```text
Read docs/handoffs/current.md and continue from it. Use the repo state as source of truth.
```

The date-specific handoff contains the current fresh-VM bootstrap contract, auth policy, required BMAD/KNX module surface, safety gates, and verification commands. `pnpm run check` includes `pnpm run check:docs`, `pnpm run check:documentation-authority`, `pnpm run check:verification-readiness`, `pnpm run check:authority-readiness`, `pnpm run check:e2e-report`, `pnpm run check:reports`, `pnpm run check:execution-boundary`, `pnpm run check:execution-evidence`, `pnpm run check:provider-fixtures`, `pnpm run check:process-lifecycle`, `pnpm run check:runbooks` for runbook verification, `pnpm run check:runtime-export`, `pnpm run check:safe-backlog`, `pnpm run check:managed-recipes`, `pnpm run check:maintenance-action-plan`, `pnpm run check:development-runway`, `pnpm run check:delivery-readiness`, `pnpm run check:maintenance-readiness`, dashboard build verification, and supervisor integration tests.
