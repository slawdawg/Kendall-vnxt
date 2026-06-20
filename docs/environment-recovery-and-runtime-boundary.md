# Environment Recovery And Runtime Boundary

Kendall_vNxt should be recoverable from Git while keeping runtime state clearly separated from source, planning, and recovery assets.

## Recovery Principle

A fresh checkout should contain enough tracked information to recreate the development environment, understand current planning decisions, and restart the supervisor/dashboard stack without relying on hidden local state.

Git should track:

- runtime source code
- shared packages and contracts
- setup scripts
- dependency manifests and lockfiles
- configuration examples
- source-owned architecture and decision documents
- recovery/runbook documentation
- deterministic test fixtures that are part of the product

Git should not track:

- installed dependencies
- local databases
- build output
- generated BMad working artifacts
- logs
- test output
- local secrets
- machine-specific configuration

## Runtime Source

Runtime source is code that participates in the product or development stack:

```text
apps/dashboard/          Dashboard runtime and operator UI
services/supervisor/     Supervisor API, queue, state, and orchestration runtime
packages/contracts/      Shared API and transport vocabulary
packages/workflow-core/  Workflow semantics shared by runtime code
scripts/                 Recoverable setup, startup, and maintenance scripts
```

These paths should be tracked unless a nested ignore rule excludes generated content such as `.next`, `.venv`, caches, or logs.

## Durable Source And Recovery Docs

Source-owned documents that should survive machine loss belong in tracked docs paths:

```text
docs/                         Durable project documentation
docs/workflows/product-requirements-boundary.md
                              Source-owned product requirement boundaries intended for Git recovery
docs/recovery/                Optional future runbooks and restore procedures
docs/implementation-*.md      Implementation checkpoints and current-state handoffs
```

BMad planning, research, PRD, epic, story, handoff, review, retrospective, and party-mode artifacts are local working products. Keep them under `_bmad-output/` or another ignored local path even when they are useful for future work. If a decision from those artifacts must become repository source, rewrite it as a small source-owned contract, runbook, or architecture note instead of tracking the generated artifact.

## Local Generated And Runtime State

Local generated state is intentionally ignored by Git:

```text
_bmad-output/       BMad generated working artifacts and drafts
.data/              Local runtime databases and logs
node_modules/       Installed JS dependencies
.next/              Next.js build output
.venv/              Python virtual environments
test-results/       Browser/test output
playwright-report/  Playwright HTML reports
```

These paths can be recreated, regenerated, or repopulated from tracked source, lockfiles, setup scripts, and docs.

## Configuration Boundary

Tracked examples should document required settings, but real local secrets and machine-specific overrides should remain ignored.

Track:

```text
.env.example
_bmad/**/config.yaml
README.md setup instructions
scripts/bootstrap-linux.sh
scripts/*.mjs
```

Ignore:

```text
.env
.env.*
_bmad/config.user.yaml
*.key
*.pem
*.p12
*.pfx
```

## Current BMAD Artifact Boundary

BMad artifacts stay local. Repository docs may capture the resulting source-owned decision, but not the generated planning artifact itself.

Example:

```text
_bmad-output/planning-artifacts/prds/.../prd.md
  -> local generated BMad working artifact, ignored

docs/workflows/product-requirements-boundary.md#supervisor-dynamic-routing-boundary
  -> source-owned product boundary, tracked by Git
```

Decision logs that matter for recovery should be rewritten into source-owned docs before tracking:

```text
docs/workflows/product-requirements-boundary.md#supervisor-dynamic-routing-boundary
```

## Recovery Expectations

A recoverable checkout should support this path:

1. Clone or restore the repo.
2. Read `README.md` and docs recovery notes.
3. Install dependencies with tracked package and lock files.
4. Recreate local env files from examples.
5. Run preflight/setup commands.
6. Start supervisor and dashboard.
7. Rebuild generated caches, test outputs, and local runtime data as needed.

Runtime data may be backed up separately if needed, but it should not be mixed into the source repo unless a deliberate fixture or migration requires it.

## Rule Of Thumb

If losing the machine would lose important product knowledge, rewrite the decision as source-owned `docs/` content or source-controlled scripts/config examples.

If the file is produced by running the app, tests, BMad workflows, package managers, or local services, keep the generated file out of Git.
