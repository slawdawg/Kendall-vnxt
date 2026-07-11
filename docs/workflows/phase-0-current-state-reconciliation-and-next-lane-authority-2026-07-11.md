# Phase 0 Current-State Reconciliation And Next-Lane Authority

Date: 2026-07-11
Status: reconciled baseline; decision-only; no new authority granted
Evidence retention: metadata only

## Purpose

This artifact records the Phase 0 baseline after Gate 5 and Gate 6 merged. It
is the source-owned handoff for the next session. It does not create a new
epic, story, PRD, worker lane, provider operation, scoring operation, or
cleanup authority.

## Reconciled baseline

- `origin/dev` is at `9e87f62417389b8d933537a6a87ed5a7094f8098`, including the
  merged Gate 5/6 terminal backlog and readiness gates.
- PR inventory is empty: no open pull requests target `dev`.
- The primary checkout remains intentionally dirty in four user-owned paths:
  `AGENTS.md`,
  `docs/workflows/latest-prd-autonomous-bmad-loop-goal.md`,
  `scripts/lib/manager-control-plane/core.mjs`, and
  `tests/manager-control-plane.test.mjs`. These changes were preserved and
  were not folded into this reconciliation lane.
- The managed manager run is stale: `manager-20260706-001` remains in
  `starting` state with its last ledger update on 2026-07-06. Its dispatcher
  summary is unavailable/stale, so queue and lease truth cannot be inferred
  from that run.
- Current read-only inventory reports 91 backlog candidates, 90 closed and 1
  claimed; 0 dispatchable lanes; 0 active leases; and 91 blocked dispatcher
  candidates.
- Assignment inventory reports 252 lane assignments, including 236 closed and
  16 `blocked_stale_owner_needs_takeover`; and 414 workspace assignments,
  including 397 closed, 15 `blocked_stale_owner_needs_takeover`, and 1
  `blocked_owned_active`.
- Canonical stale-owner inspection covered 12 targets: 1 requires canonical
  closeout evidence, 9 require dirty-worktree preservation, and the remaining
  clean targets remain blocked pending operator/evidence approval.
- Workspace orientation reports 8 tmux panes, 4 manager-owned panes, 2
  unmanaged panes, and 2 panes whose recorded worktrees are missing.
- Worker posture is 0 active, 4 warm, and 2 retirement-blocked. Usage is
  normal with 95% remaining; weekly usage is unavailable and must not be
  treated as pressure. CPU and RAM posture are normal.

## Baseline interpretation

The implementation gates are current and green, but the manager runtime
control state is not ready for autonomous mutation. The immediate technical
debt is stale run/dispatcher state, ambiguous stale-owner records, dirty
workspace preservation, missing tmux/worktree orientation, and absent current
source evidence in the refill packet. These are reconciliation debts, not
permission to invent post-slice product work.

## Required repair order

1. Preserve all dirty stale-worktree evidence and resolve the one sanitized or
   legacy assignment id to canonical closeout evidence.
2. Reconcile the two missing tmux/worktree references without mutating unknown
   panes or taking ownership of any lane implicitly.
3. Refresh or retire the stale manager run and reconstruct dispatcher summary
   and lease truth through existing read-only/runtime gates.
4. Rerun preflight, resume-state, cycle-packet, assignment, and stale-owner
   inspection checks. Keep dispatch blocked until those packets agree.
5. Refresh authority-readiness and current-state evidence after runtime state
   is coherent.

No takeover, cleanup, worker launch/retirement, dispatch apply, provider call,
credential access, or GitHub mutation is authorized by this artifact.

## Next-lane recommendation

The existing execution-authority decision contract identifies
`adaptive-scoring` decision preparation as the recommended candidate lane. The
candidate is not selected or approved yet. The safe next package is the
existing non-executing `docs/workflows/adaptive-scoring-decision-prep.md`
contract and `pnpm run check:adaptive-scoring`, which passed during this
reconciliation.

Before any future exact approval packet, the lane must name its intended use,
affected decision surfaces, lifecycle owners, approved metadata inputs,
prohibited inputs, advisory-only boundary, measurement and calibration plan,
negative fixtures, review/appeal path, rollback, stop lines, and expiry. No
score may be computed, persisted, displayed, or allowed to affect priority,
routing, delivery, cleanup, authority, merge, or verification.

Provider expansion, subscription-agent process launch, premium execution,
GitHub branch protection, delivery automation, cleanup automation, and new
post-slice epics remain alternative approval-required lanes, not current work.

## Evidence commands

- `mise run setup`
- `mise run workspace-doctor`
- `mise run preflight`
- `node ./scripts/manager-preflight.mjs --summary-json`
- `node ./scripts/manager-resume-state.mjs --summary-json`
- `node ./scripts/manager-cycle-packet.mjs --summary-json`
- `node ./scripts/manager-stale-owner-inspection.mjs --summary-json`
- `pnpm run check:adaptive-scoring`
- `gh pr list --state open --base dev --limit 100 --json number,title,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,updatedAt,url`

All outputs above are metadata-only summaries. Generated BMAD stories,
reviews, retrospectives, and handoffs remain local planning state under
`_bmad-output/`.
