# Stale-lane archival and reconciliation — 2026-07-12

## Scope and authority

This record covers the five Group C lanes and the Gate4 lane named in the
operator cleanup request. The operator authorized cleanup of stale items. No
provider or GitHub calls were made, and no source files in the primary
checkout were changed.

The comparison ref was `origin/dev` at
`883fc7b100ec620323980a8e8a46e0f80c13176d`. Every scoped lane is behind that
ref and has zero commits ahead of it. The lane-specific state is therefore
dirty worktree state that must remain recoverable even when the committed
branch ancestry is superseded.

## Decisions

“Supersede” means the lane’s committed ancestry is no longer needed as a
separate lane because it is already contained in `origin/dev`; it does not
authorize discarding dirty files. “Retain” means keep the lane and its
manifest owner state pending a lifecycle-accepted decision.

| Lane | Decision | Current evidence | Preserved paths |
| --- | --- | --- | --- |
| `20260709-bmad-23-6-overnight-run-recovery-and-housekeeping` | Supersede | `origin/dev...HEAD = 151 0`; 1 dirty tracked path; owner heartbeat stale | `scripts/lib/manager-control-plane/core.mjs`; per-lane patch and empty untracked tar |
| `20260710-fix-booting-promotion-review-remediation` | Supersede | `origin/dev...HEAD = 131 0`; 2 dirty tracked paths; owner heartbeat stale | `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs`; per-lane patch and empty untracked tar |
| `20260710-fix-booting-promotion-second-review` | Supersede | `origin/dev...HEAD = 131 0`; 2 staged tracked paths; owner heartbeat stale | `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs`; per-lane patch and empty untracked tar |
| `20260710-fix-booting-warm-reviewer-promotion-worker` | Supersede | `origin/dev...HEAD = 131 0`; 2 dirty tracked paths; owner heartbeat stale | `scripts/lib/manager-control-plane/core.mjs`, `tests/manager-control-plane.test.mjs`; per-lane patch and empty untracked tar |
| `20260710-harden-manager-full-verification-fail-closed-ser` | Supersede | `origin/dev...HEAD = 131 0`; 5 staged tracked paths; owner heartbeat stale | `package.json`, `scripts/check-manager-control-plane.mjs`, `scripts/lib/manager-control-plane-verification.mjs`, `scripts/run-manager-control-plane-shards.mjs`, `tests/manager-control-plane-verification.test.mjs`; per-lane patch and empty untracked tar |
| `20260712-gate-4-bmad-dashboard-proof` | Retain | `origin/dev...HEAD = 9 0`; 1 untracked path; lifecycle reports owner heartbeat not stale | `tests/gate4-bmad-dashboard-e2e.test.mjs` in the per-lane untracked tar; empty tracked patch |

The complete bounded status record, patch hashes, byte counts, archive hashes,
and archive entry list remain in the local preservation packet:

`_bmad-output/active-worktree-preservation-2026-07-12/group-c/preservation-evidence.md`

Each lane directory in that packet contains a binary-safe tracked patch and an
archive of non-ignored untracked files. No raw prompts or provider output are
included.

## Cleanup safety

All six scoped worktrees remain present. No branch, manifest, worktree, or
remote ref was deleted. Existing branch and manifest paths remain the
authoritative lifecycle evidence:

`<managed-workspace-state>/tasks/<lane>.json`

The five Group C worktrees are dirty, so takeover and cleanup must not mutate
them until their preserved dirty state is resolved by the governed workflow.
The Gate4 worktree is also dirty and its owner heartbeat is currently within
the lifecycle stale threshold, so it must remain retained even though the
operator request labels it stale.

The lifecycle dry-runs refused before any cleanup-ready state: ownership
takeover was required, dirty worktrees were guarded, and Gate4 additionally
reported a non-stale owner heartbeat. No unsafe cleanup, reset, checkout,
blind deletion, branch deletion, or worktree removal was attempted.

## Verification boundary

Validation was limited to Git ancestry/status/diff inspection, patch and tar
hash/list checks, and lifecycle dry-runs. No tests, providers, worker
launches, source mutation, PR creation, GitHub mutation, branch deletion, or
worktree removal were performed in the reconciliation run.
