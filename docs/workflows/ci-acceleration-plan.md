# CI Acceleration Plan

Date: 2026-07-07
Status: active design artifact

## Problem

Pull request CI currently gives trustworthy coverage, but the slowest feedback
path is too expensive. The `static` job runs `pnpm run check:static`, which is a
large serial chain. When a late command fails, the operator pays the same long
wait again after the fix.

The target is not weaker CI. The target is faster failure discovery, faster
repair loops, and the same or better confidence before merge.

## Principles

- Local checks should catch author mistakes before push.
- CI should prove system confidence, not be the first syntax or obvious contract
  checker.
- Changed-file checks are an accelerator, not the final safety authority.
- Slow checks should have owners, timing evidence, and a reason to run.
- Unknown or high-risk changes must escalate to broader verification.
- Local and CI planning must come from the same source-owned mapping so they do
  not drift.

## Architecture

### 1. Quick-Fail Layer

Always run the cheapest checks first:

- `git diff --check`
- syntax checks for changed `.js`, `.mjs`, and `.cjs` files
- JSON parsing for changed `.json` files

This layer should normally fail in seconds.

### 2. Changed-Plan Layer

Map changed files to known surfaces and focused commands:

- manager control plane
- Codex workspace protocol
- dashboard and pipeline fixtures
- supervisor service
- GitHub workflow policy
- package/dependency contracts
- anti-churn and sandbox boundary tooling
- docs/runbook alignment

When a path is unknown, shared, or high-risk, the plan marks
`requiresFullStatic: true`.

### 3. CI Bundle Layer

Split the current monolithic static job into package scripts and later CI jobs:

- `static-core`: package scripts, docs index, workflow policy, syntax
- `static-manager`: manager-control-plane checks and tests
- `static-workspace`: worktree, workspace, delivery protocol checks
- `static-policy`: authority, provider, cleanup, lifecycle, retention checks
- `static-pipeline-dashboard`: pipeline and dashboard source contracts
- `static-anti-churn`: anti-churn, sandbox, and tool-churn support checks

Run these in parallel in CI after local bundle scripts are proven.

### 4. Full Confidence Layer

Keep full verification for:

- push to protected integration branches
- nightly or scheduled full checks
- manual full-verification labels
- package, workflow, dependency, or unknown high-risk changes
- release or promotion branches

## Rollout

1. Add `scripts/check-plan.mjs`.
2. Add `pnpm run check:quick-fail`.
3. Add `pnpm run check:changed`.
4. Teach `finish-pr` to run `check:changed` before pushing.
5. Split package scripts into static bundles while keeping `check:static` as an
   aggregate.
6. Route pull request CI component jobs from `check-plan --ci-outputs` so
   `static` runs only when the planner marks full static confidence required.
7. Add CI jobs for bundles as non-required reporting checks.
8. Compare bundle results against monolithic static.
9. Promote bundles to required checks and retire the monolithic PR static job.
10. Add duration artifacts and optimize bundle balance from evidence.

## Gate Evidence

Future PR gate evidence should record:

- changed files
- detected surfaces
- selected local commands
- skipped commands and why
- whether full static was required
- CI bundles required and why
- exact PR head SHA
- unresolved review-thread count

## Measurement Slices

After planner-driven PR routing is merged, the first proof slice should be a
docs-only PR that changes this plan. Expected PR checks:

- `changes`: pass
- `fast`: pass
- `check`: pass
- `static`: skipped
- `javascript`: skipped
- `supervisor`: skipped

If those skips occur, the planner has removed the static and supervisor wait
from focused documentation and planner-policy PRs. If any broad job runs, treat
the check output as routing evidence and fix the planner before starting the
static-bundle split.

The first measurement attempt exposed a workflow-local artifact hazard:
redirecting planner JSON to `ci-outputs.json` inside the checkout made
`check-plan` see that untracked file and escalate to full static. CI planner
artifacts must be written under `$RUNNER_TEMP` or another path outside the Git
worktree before collecting changed files.

Record the second measurement PR after the `$RUNNER_TEMP` fix with the observed
check durations and skipped jobs before starting the static-bundle split.

## Stop Lines

Do not remove existing static coverage just to reduce time. First introduce the
planner and bundle scripts, prove equivalence, then switch CI requirements.

Do not treat a passing changed-file plan as merge authority. It is pre-CI
feedback only.

Do not quarantine a slow or flaky check without an owner, reason, replacement
coverage, and expiry.
