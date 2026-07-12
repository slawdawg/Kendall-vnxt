# BMAD stale-lane archival and reconciliation

Date: 2026-07-12
Operator authorization: explicit approval for stale-lane cleanup was supplied for this run.
Scope: the eight July 4–5 BMAD lanes named below only.
Comparison base: `origin/dev` at `883fc7b100ec620323980a8e8a46e0f80c13176d`.
Cleanup worker: managed experiment worktree `20260712-bmad-stale-lane-archival-reconciliation-2026-07` from `origin/dev`.

## Decision summary

All eight lanes are **supersede** decisions. Every committed lane head is an
ancestor of current `origin/dev`, with `origin/dev` ahead by 338–348 commits.
The current source contains the lane behaviors in newer or expanded form:

- lifecycle and authority rules;
- replayable action projection;
- adapter and dispatcher-port contracts;
- runtime modes and readiness projections;
- source-backed packet seed and eligibility;
- minimum happy-path and blocked-path operational proofs; and
- operational summary and capability gating.

The dirty state is nevertheless preserved as binary-safe local patches before
any retirement attempt. No raw prompts or provider output are included.

## Per-lane evidence and preserved paths

| Lane | Decision | Committed comparison | Preserved tracked paths |
| --- | --- | --- | --- |
| `20260704-bmad-1-2-lifecycle-transition-and-authority-rules` | Supersede | `HEAD=a61cd58eac11443daec37d9320606a0415726aea`; `origin/dev...HEAD=348 0` | contracts, workflow-core, manager loop, and lifecycle tests |
| `20260704-bmad-1-4-replayable-action-projection` | Supersede | `HEAD=a61cd58eac11443daec37d9320606a0415726aea`; `origin/dev...HEAD=348 0` | manager-control-plane core and tests |
| `20260704-bmad-2-2-adapter-contract-test-suite` | Supersede | `HEAD=a61cd58eac11443daec37d9320606a0415726aea`; `origin/dev...HEAD=348 0` | dashboard summary, contracts, dispatcher adapter/port, fixtures, helpers, and tests |
| `20260705-bmad-2-3-runtime-readiness-and-operational-modes` | Supersede | `HEAD=f2dc635d32a3d39f373e402a67ecfd301916d3c9`; `origin/dev...HEAD=346 0` | workspace lifecycle, manager core/loop, and tests |
| `20260705-bmad-3-1-source-backed-packet-seed-and-eligibility` | Supersede | `HEAD=8112555a43cc034354522535d9e3e81152497572`; `origin/dev...HEAD=340 0` | package metadata, manager check/core, source-packet seed, and tests |
| `20260705-bmad-3-2-minimum-happy-path-operational-loop` | Supersede | `HEAD=3a0c11c217e74ea99757e8ce1ace7b853e8b436f`; `origin/dev...HEAD=338 0` | manager-control-plane core and tests |
| `20260705-bmad-3-3-blocked-path-operational-proof` | Supersede | `HEAD=3a0c11c217e74ea99757e8ce1ace7b853e8b436f`; `origin/dev...HEAD=338 0` | manager-control-plane core and tests |
| `20260705-bmad-4-1-operational-summary-and-capability-gated-action-projection` | Supersede | `HEAD=3a0c11c217e74ea99757e8ce1ace7b853e8b436f`; `origin/dev...HEAD=338 0` | manager-control-plane core and tests |

The complete per-lane status, preserved patch paths, hashes, and archive
entries remain in:

`_bmad-output/active-worktree-preservation-2026-07-12/bmad/`

## Cleanup safety and lifecycle

The primary checkout was clean before and after inspection. The eight target
worktrees are dirty, so any managed cleanup that requires clean worktrees must
fail closed. No target worktree, branch, assignment, manifest, or remote ref
was changed. Do not reset, checkout, blind-delete, or manually remove their
content; the preserved patch evidence is the rollback/recovery boundary.

The supported lifecycle dry-runs required takeover rather than silently
changing ownership, then stopped before mutation with the exact blocker:
`workspace worktree is dirty`. Each target reported a stale heartbeat,
`worktree dirty`, no PR, and approval present. No unsafe cleanup was attempted.

Until the lifecycle reports cleanup-ready for a clean, owner-resolved lane,
the eight target lanes remain preserved and retained locally despite their
supersede decisions.

## Verification boundary

Read-only validation covered Git status, worktree ancestry, source-symbol
reconciliation, preservation patch hashes, and lifecycle dry-runs. No
provider calls, external workers, dispatch, source mutation, tests, PR
creation, GitHub mutation, branch deletion, or worktree removal were performed.
