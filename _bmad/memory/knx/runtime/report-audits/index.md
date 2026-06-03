# KNX Runtime Audit Index

Last updated: 2026-06-02

Purpose: classify runtime artifacts so future maintenance passes can distinguish active routing/evidence records from dated historical snapshots and proposal-only materials.

## Classification Rules

- `active`: used to represent the current KNX local-only maintenance baseline and should be kept aligned when scoped state changes.
- `historical snapshot`: preserves prior state, checkpoints, or superseded handoffs/workflow captures and should not be rewritten just to match the current baseline.
- `proposal-only`: planning or staging material that intentionally captures a pre-execution recommendation and should remain frozen unless the proposal artifact itself is being revised.

## Active Records

- `runtime/handoffs/handoff-2026-06-01-current.md`
- `runtime/backlog/local-backlog-2026-06-01.md`
- `runtime/greenfield-implementation/implementation-runway-2026-06-01.md`
- `runtime/greenfield-implementation/post-gate-continuation-2026-06-01.md`
- `runtime/greenfield-implementation/initial-local-development-closure-2026-06-02.md`
- `runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.md`
- `runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.json`
- `runtime/report-audits/ksev-report-pointer-audit-2026-06-02.md`
- `runtime/report-audits/runtime-evidence-broader-audit-2026-06-02.md`
- `runtime/source-packets/validator-report/source-evidence-validation.md`
- `runtime/source-packets/validator-report/source-evidence-validation.json`
- `runtime/optional-source-evidence-validator/reports/source-evidence-validation.md`
- `runtime/optional-source-evidence-validator/reports/source-evidence-validation.json`

Audit expectation:
- refresh only when current validation, pointers, inventory counts, or routing state changes.

## Historical Snapshots

- `runtime/handoffs/handoff-2026-06-01.md`
- `runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md`
- `runtime/commit-readiness/reports/commit-readiness-2026-06-01.md`
- `runtime/greenfield-implementation/work-trace-*.md`
- `runtime/greenfield-implementation/*/work-trace-*.md`
- `runtime/source-inventory/*`
- `runtime/runtime-inventory/*`
- `runtime/evaluation-packet/*`

Audit expectation:
- treat stale commits, counts, or validation baselines here as historical capture unless a newer active record explicitly depends on them.

## Proposal-Only Records

- `runtime/commit-readiness/reports/staging-plan-2026-06-01.md`

Audit expectation:
- do not update just to match current branch state; revise only if the proposal itself is reopened.

## Current Baseline

- Latest substantive KNX governance commit is tracked in:
  - `../index.md`
  - `../handoffs/handoff-2026-06-01-current.md`
- Current runtime-evidence audit baseline:
  - `runtime-evidence-broader-audit-2026-06-02.md`
- Current `ksev` pointer and validation audit baseline:
  - `ksev-report-pointer-audit-2026-06-02.md`

## Use In Future Passes

1. Check `active` records first.
2. Refresh `historical snapshot` artifacts only when preserving or annotating prior state is the goal.
3. Leave `proposal-only` records untouched unless the proposal is being reopened.
