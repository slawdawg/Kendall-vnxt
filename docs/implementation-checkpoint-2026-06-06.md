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
