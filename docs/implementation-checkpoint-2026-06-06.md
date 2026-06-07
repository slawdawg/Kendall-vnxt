# Implementation Checkpoint — 2026-06-06

## Purpose

This checkpoint resets the working implementation plan against what is actually in `main` after PRs #1 through #6.

The goal is to keep the repo aligned around the same question:

- what the operator control plane is for
- what the supervisor already owns
- what work is complete
- what should happen next

## Target Architecture

The current target architecture is a split control-plane system:

1. `apps/dashboard`
   - operator-facing Next.js control plane
   - intake, queue browsing, attention review, audit review, detail inspection, and operator actions
   - browser coverage for critical operator workflows

2. `services/supervisor`
   - FastAPI orchestration service
   - owns work-item intake, workflow transitions, retry, audit routing, assignment, escalation, saved views, and event history
   - acts as the system of record for operator-visible workflow state

3. `packages/contracts`
   - shared transport vocabulary between dashboard and supervisor
   - keeps work-item, event, action, and filter shapes consistent

4. `packages/workflow-core`
   - shared workflow semantics support

## Design Intent

The dashboard should be the operator surface for supervising work, not the place where workflow rules live.

The supervisor should progressively absorb repeatable execution mechanics:

- queue progression
- action policy enforcement
- retries
- audit gates
- escalation state
- saved operator views
- eventually, constrained automation recipes for narrow task classes

Human-directed development still owns:

- feature prioritization
- architecture changes
- broad refactors
- ambiguous debugging
- deciding when new work is mature enough to become supervisor-managed

## Completed Since The Initial Dashboard Push

### Foundation

- migrated the JS workspace to `pnpm`
- added setup / preflight / doctor workflows
- updated CI for `pnpm` and `uv`
- pinned the Node baseline

### Operator Workflow Features

- dashboard intake draft persistence
- guided "Start next work" flow for non-coder operators
- mobile-first detail-page improvements
- sticky next-action strip and anchor navigation
- self-detected issues attention filtering
- retry history on work-item detail pages
- assignment controls on work-item detail pages
- escalation controls on work-item detail pages
- saved/shared operator views persisted through the supervisor

### Supervisor Capabilities

- workflow event history endpoint
- retry endpoint
- assignment endpoint
- escalation endpoint
- operator view persistence and defaulting
- self-detected issue metadata surfaced in work-item views
- origin-aware and issue-aware filter payload support

### Verification Coverage

- supervisor integration coverage for retry, assignment, escalation, operator views, and self-detected issues
- Playwright coverage for:
  - mobile intake draft restore
  - guided intake templates and advanced fields
  - compact queue workflow action buttons
  - detail-page anchor navigation
  - retry-history anchor navigation
  - attention filter for self-detected supervisor issues
  - assignment claim flow
  - escalation create / clear flow

## Drift Assessment

We have not drifted from the product direction.

We have drifted somewhat from the original slice order:

- more time went into hardening the operator surface and E2E coverage
- less time has gone into moving new execution responsibility into the supervisor itself

That drift is acceptable for now because the control plane is now substantially more stable and test-backed.

The main risk is different:

- continuing to improve the dashboard and its browser tests
- without a matching increase in supervisor-owned execution logic

If left unchecked, that would produce a polished operator shell around a still-too-manual orchestration layer.

## Decision

The next planning priority is:

**shift from operator-surface expansion toward supervisor execution expansion**

That means the next slice should favor moving repeatable work into the supervisor over adding more dashboard polish, unless a missing operator workflow is actively blocking use.

## Next Recommended Slices

### Priority 1

Define and implement the first constrained supervisor-managed development recipe.

Candidate:

- narrow dashboard test-coverage expansion workflow

Expected shape:

- branch creation from clean `main`
- narrow task execution
- verification with existing repo commands
- PR creation
- CI wait
- merge when green

### Priority 2

Add explicit supervisor-side execution policy for when autonomous work is allowed to proceed versus when it must stop for operator review.

This should cover at least:

- dirty repo handling
- stale branch / stale worktree handling
- branch ownership rules
- verification requirements before PR
- merge gating requirements

### Priority 3

Only after the first supervisor-managed recipe is stable, add more dashboard coverage for saved/shared operator views.

That is still valuable, but it is no longer the highest-leverage next step.

## Immediate Working Rule

Until a new checkpoint supersedes this one:

- prefer slices that increase supervisor-owned execution capability
- treat dashboard work as support work for that goal
- avoid spending multiple consecutive slices on UI/test hardening alone unless it unblocks supervisor adoption

## Supervisor Execution Progress - 2026-06-06

The first constrained execution recipe is now represented as supervisor-owned policy, not just dashboard text.

Implemented:

- `dashboard-test-coverage` and `dashboard-mobile-coverage` recipe metadata now include policy gates and operator checkpoints.
- Work-item views expose policy gates, verification commands, allowed paths, autonomy guardrails, and checkpoints through shared contracts.
- The dashboard detail page renders the recipe gates and checkpoints from live supervisor data.
- Recipe triage blocks unknown recipe IDs instead of silently falling back to unmanaged manual work.
- Recipe workflow actions require operator checkpoint notes before validation, review entry, and final review approval.
- Workflow events now carry recipe gate evidence for recipe selection, scope review, clean-worktree start, verification, review entry, and operator approval.
- Recipe triage now generates non-mutating branch records when branch metadata is missing, recording `executionBranch`, `baseBranch`, and `baseRevision` before implementation is allowed to proceed.
- Recipe implementation now blocks unless the supervisor can verify branch ownership: recorded `executionBranch`, matching branch prefix, current branch match, current `baseRevision`, and recorded base revision ancestry.
- Recipe implementation start now runs only selected recipe commands from structured argument vectors, records `recipe.implementation_passed` evidence on success, and routes to rework with `recipe.implementation_failed` evidence on failure.
- The dashboard recipe now includes a deterministic code-edit generator, `node scripts/dashboard-test-coverage-recipe.mjs`, which idempotently maintains `tests/e2e/supervisor-managed-recipe.spec.ts` inside the recipe `allowedPaths` boundary.
- The mobile dashboard recipe now includes a deterministic code-edit generator, `node scripts/dashboard-mobile-coverage-recipe.mjs`, which idempotently maintains `tests/e2e/supervisor-managed-mobile-recipe.spec.ts` inside the recipe `allowedPaths` boundary.
- Recipe implementation automation now performs an immediate post-command path-scope check before entering implementation, recording `recipe.implementation_path_scope_passed` or routing to rework with `recipe.implementation_path_scope_failed`.
- Recipe validation handoff now enforces the recipe `allowedPaths` boundary before commands run, recording `recipe.path_scope_passed` or routing to rework with `recipe.path_scope_failed` evidence.
- Recipe validation handoff now runs only the selected recipe's verification commands, records `recipe.verification_passed` evidence on success, and routes to rework with `recipe.verification_failed` evidence on failure.
- Recipe review entry now records `recipe.delivery_gate_recorded` with a local delivery package: changed paths, out-of-scope paths, diff summary availability, branch/base metadata, and record-only PR/CI/merge status before final operator review.
- Recipe final approval now requires recorded PR/CI/merge readiness or an explicit operator waiver; local delivery packages remain review evidence and remote operations remain record-only.
- The supervisor exposes a delivery-readiness endpoint that records PR, CI, merge, URL, and waiver evidence without performing remote operations.
- Work-item views and the dashboard detail page now surface delivery readiness and whether the recipe is ready for final approval.
- Execution recipes now expose a first-class remote automation policy: allowed record-only operations, blocked remote operations, and the KNX boundary requirements that must be met before live PR/CI/merge automation can be enabled.
- The supervisor now exposes a recipe gate audit endpoint that derives pass/pending/blocked status for each policy gate from workflow events, delivery readiness, and final review state.
- The dashboard detail page renders the recipe gate audit as an operator-visible policy ledger.
- The dashboard workflow history now renders `recipe.delivery_gate_recorded` as a local delivery package panel with changed paths, out-of-scope paths, diff stat, package status, and remote-operation policy.
- The supervisor now exposes `GET /execution-recipes` as the recipe catalog, and the dashboard intake form renders selected recipe details from that supervisor-owned catalog.
- The supervisor now exposes `GET /work-items/{id}/recipe-gate-audit`, summarizing each recipe gate as pending, passed, or blocked from workflow evidence and current delivery state.
- The dashboard work-item detail page now renders the recipe gate audit as an operator checkpoint ledger.
- The supervisor now exposes `POST /work-items/{id}/prepare-branch`, which creates or switches to the recorded recipe branch only after clean-worktree and base-revision checks pass.
- The dashboard work-item detail page now renders a branch preparation checkpoint so operators can trigger and review the supervisor-owned branch boundary before implementation.
- The supervisor recipe gate audit now includes `nextManagedAction`, a deterministic next step with action id, status, required gate, operator checkpoint, allowed actor, and remote-operation flag.
- The dashboard recipe gate audit now renders the supervisor-approved next managed action above the policy ledger.
- The supervisor now exposes `POST /work-items/{id}/managed-next-action`, which executes only the current available managed action, rejects stale expected action ids, rejects blocked/remote actions, and routes evidence-heavy delivery readiness back to the dedicated checkpoint form.
- The dashboard recipe gate audit now lets operators trigger executable managed actions from the policy ledger while preserving checkpoint notes and supervisor-side gate validation.
- The supervisor now resolves recipe command executables through `pnpm.cmd` or `corepack pnpm` when `pnpm` is not directly on `PATH`, so the managed implementation step can run reliably in the Windows browser server environment.
- Browser coverage now proves the managed recipe stops safely at the path-scope gate when the current workspace includes out-of-scope changes, rather than pretending the supervisor can run through an unsafe implementation attempt.
- The supervisor now has an opt-in remote delivery executor that can push the branch, create a PR, wait for CI, and merge when `SUPERVISOR_ALLOW_REMOTE_DELIVERY` is enabled.
- The dashboard recipe gate audit now exposes a supervisor-executable remote delivery step when remote delivery is explicitly enabled.

Verification:

- `uv run pytest tests/integration/test_supervisor_flow.py -q`: 16 passed.
- `pnpm run check`: preflight passed, dashboard build passed, supervisor integration suite passed.
- Local Chrome-backed browser verification confirmed the recipe panel renders policy gates and operator checkpoints from a seeded supervisor work item.
- Later branch-gate verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 18 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Branch-record verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 17 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Constrained command verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 18 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Allowed-path gate verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 19 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Delivery-readiness gate verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 19 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Implementation automation gate verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 21 passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 7 passed; `git diff --check`: passed.
- Deterministic code-edit recipe verification: `node scripts/dashboard-test-coverage-recipe.mjs`: no changes needed; `pnpm run lint:dashboard`: passed; `pnpm run test:e2e:dashboard`: 7 passed.
- Second recipe verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 22 passed; `node scripts/dashboard-mobile-coverage-recipe.mjs`: no changes needed; `pnpm run lint:dashboard`: passed; `pnpm run test:e2e:dashboard`: 8 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Local delivery package verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 22 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Delivery package dashboard rendering verification: `pnpm run build:dashboard`: passed; `pnpm run lint:dashboard`: passed; `pnpm run test:e2e:dashboard`: 9 passed; `uv run pytest tests/integration/test_supervisor_flow.py -q`: 23 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Delivery readiness approval verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 23 passed; `pnpm --filter @kendall/dashboard build`: passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 9 passed.
- Unsafe delivery package rejection verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 24 passed; `pnpm run check`: passed; `git diff --check`: passed.
- Remote automation policy verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 25 passed; `pnpm --filter @kendall/dashboard build`: passed.
- Recipe gate audit verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 25 passed; `pnpm --filter @kendall/dashboard build`: passed.
- Recipe catalog verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 25 passed; `pnpm run build:dashboard`: passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 10 passed; `git diff --check`: passed with existing CRLF normalization warnings.
- Gate audit verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 25 passed; `pnpm run build:dashboard`: passed; `pnpm run lint:dashboard`: passed; `pnpm run test:e2e:dashboard`: 10 passed; `pnpm run check`: passed; `git diff --check`: passed with existing CRLF normalization warnings.
- Managed next action verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 28 passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 10 passed.
- Managed triage browser verification: `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "runs the supervisor-approved managed triage action from the gate audit"`: passed; `pnpm run test:e2e:dashboard`: 11 passed.
- Path-scope browser verification: `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "halts the managed recipe when implementation escapes the allowed path boundary"`: passed; `pnpm run test:e2e:dashboard`: 12 passed.
- Remote-delivery integration verification: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k remote_delivery`: 2 passed.
- Branch preparation verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 27 passed; `pnpm run build:dashboard`: passed; `pnpm run lint:dashboard`: passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 10 passed; `git diff --check`: passed with existing CRLF normalization warnings.
- Next managed action verification: `uv run pytest tests/integration/test_supervisor_flow.py -q`: 29 passed; `pnpm run build:dashboard`: passed; `pnpm run lint:dashboard`: passed; `pnpm run check`: passed; `pnpm run test:e2e:dashboard`: 12 passed; `git diff --check`: passed with existing CRLF normalization warnings.

Remaining before supervisor-owned end-to-end development flow:

- live remote-delivery smoke proof against a real repository/CI target instead of a mocked integration harness
- operator review checkpoints for each automation boundary

## Latest Supervisor-Managed Execution Update

Progress:

- The dashboard browser suite is green again with the managed path-scope stop aligned to the current supervisor state ladder.
- The supervisor now has an opt-in remote-delivery executor behind `SUPERVISOR_ALLOW_REMOTE_DELIVERY`, with a real subprocess smoke test that pushes to a local bare remote and drives a `gh` shim through PR creation, CI watch, and merge reporting.
- The recipe gate audit still surfaces the live remote-delivery policy so operators can see whether remote operations are blocked, recorded, or explicitly enabled.

Verification:

- `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k remote_delivery`: 2 passed.
- `pnpm run test:e2e:dashboard`: 12 passed.
- `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "halts the managed recipe when implementation escapes the allowed path boundary"`: passed.

Current status:

- Supervisor-owned execution is now covering branch prep, path scope, managed actions, delivery readiness, and an opt-in remote-delivery seam.
- A live end-to-end remote-delivery smoke run against a real repo/CI target is still the next high-value proof before claiming full supervisor ownership.
