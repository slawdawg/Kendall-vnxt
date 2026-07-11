# Phase 0 Runtime Repair Gate And Next-Lane Authority

Date: 2026-07-11
Status: runtime repair gated; decision-only; no new authority granted
Evidence retention: metadata only

## Purpose

This artifact updates the Phase 0 baseline after Gate 5, Gate 6, and the
current-state reconciliation artifact merged. It is the source-owned handoff
for the next session. It does not create a new epic, story, PRD, worker lane,
provider operation, scoring operation, takeover, or cleanup authority.

## Reconciled baseline

- `origin/dev` is at `c1cfe896ffedde7f3e0bc11c86fc12e1903d5493`, including the
  merged Gate 5/6 terminal backlog and readiness gates plus the Phase 0
  reconciliation artifact.
- PR inventory is empty: no open pull requests target `dev`.
- Epic 25-1 (#473), Epic 25-2 (#474), the earlier 24-1 fixture stabilization
  (#461), and the Phase 0 reconciliation (#485) are merged. There is no open
  PR available for merge or review-fix work.
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
- Current read-only preflight reports 103 backlog candidates, 102 closed and 1
  claimed; 0 dispatchable lanes; 0 active leases; and 103 blocked dispatcher
  candidates. The authoritative PRD source is present and exhausted; dispatcher
  state is unavailable/stale.
- Assignment inventory reports 252 lane assignments, including 236 closed and
  16 `blocked_stale_owner_needs_takeover`; and 415 workspace assignments,
  including 398 closed, 15 `blocked_stale_owner_needs_takeover`, 1
  `blocked_owned_active`, and 1 active assignment.
- Canonical stale-owner inspection covered 12 targets: 1 requires canonical
  closeout evidence, 9 require dirty-worktree preservation, and the remaining
  clean targets remain blocked pending operator/evidence approval.
- Workspace orientation reports 8 tmux panes, 4 manager-owned panes, 2
  unmanaged panes, and 2 panes whose recorded worktrees are missing.
- Worker posture is 0 active, 4 warm, and 2 retirement-blocked. Usage is
  normal with 93% remaining; weekly usage is unavailable and must not be
  treated as pressure. CPU and RAM posture are normal.

## Runtime repair gate

The exact outside-sandbox preflight at 2026-07-11T15:37Z confirmed that the
manager runtime is read-only and blocked: the stale run is
`manager-20260706-001` in `starting` state, dispatcher freshness is unknown,
safe work supply is zero and the authoritative PRD has no remaining backlog.
Tmux
orientation found 8 panes, 4 manager-owned panes, 2 unmanaged panes, and 2
missing-worktree references. No pane was mutated.

The exact stale-owner inspection covered 12 targets. The sanitized target now
resolves canonically to
`3-3-execution-completion-and-failure-evidence`; its worktree, local branch,
remote branch, and PR are all absent, so the close-assignments dry-run marks it
eligible for stale-record cleanup. Apply remains blocked pending explicit
operator approval. Nine dirty stale workspaces have bounded preservation
evidence, 2 clean stale lanes remain blocked on explicit takeover/evidence, and
there are 0 other cleanup candidates and 0 takeover-approval candidates. No
takeover, worker mutation, dispatch apply, provider call, GitHub delivery
mutation, merge, or cleanup apply has been performed.

## Canonical stale-record cleanup approval packet

Target: `3-3-execution-completion-and-failure-evidence`

Evidence: the exact dry-run reported `worktreeStatus: missing`, absent local
and remote branch heads, no PR references, and `staleRecordCleanupEligible:
true`. No source files or active worktree are attached to this record.

Required mutation gate: an operator must explicitly approve stale-record
cleanup before the existing command may apply it. The target-specific command
is:

```text
node ./scripts/codex-workspace.mjs close-assignments --ids 3-3-execution-completion-and-failure-evidence --allow-stale-record-cleanup --approval "<explicit operator approval>" --apply
```

This packet does not approve that command, and it does not authorize takeover
or cleanup of the remaining dirty or ambiguous lanes.

The current primary-checkout patch also remains held. Its manager-control-plane
diff removes authoritative worker assignment locks, review reservation and
lease identity checks, pane/session identity revalidation, and self-review or
assignment-history exclusions. Its full manager test suite is not green: the
remaining failures include stale 24-to-25 fixture expectations, warm-handoff
behavior, and stale-owner story-artifact numbering. The patch must not be
delivered as a baseline repair until those safety invariants and tests are
reconciled by the owning lane.

## Baseline interpretation

The implementation gates are current and green, but the manager runtime
control state is not ready for autonomous mutation. The immediate technical
debt is stale run/dispatcher state, ambiguous stale-owner records, dirty
workspace preservation, missing tmux/worktree orientation, and absent current
source evidence in the refill packet. These are reconciliation debts, not
permission to invent post-slice product work.

## Required repair order

1. Preserve all dirty stale-worktree evidence and apply the canonical stale
   record cleanup only after the explicit approval packet above is satisfied.
2. Reconcile the two missing tmux/worktree references without mutating unknown
   panes or taking ownership of any lane implicitly.
3. Refresh or retire the stale manager run and reconstruct dispatcher summary
   and lease truth through existing read-only/runtime gates.
4. Rerun preflight, resume-state, cycle-packet, assignment, and stale-owner
   inspection checks. Keep dispatch blocked until those packets agree.
5. Refresh authority-readiness and current-state evidence after runtime state
   is coherent.
6. Reconcile the primary-checkout patch against the current source baseline;
   restore or prove every worker lock, lease, reservation, pane identity, and
   review-routing safety invariant before any PR delivery.

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
- `pnpm run check:authority-readiness`
- `pnpm run check:branch-protection-readiness`
- `pnpm run check:delivery-readiness`
- `pnpm run check:cleanup-automation`
- `gh pr list --state open --base dev --limit 100 --json number,title,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,updatedAt,url`

All outputs above are metadata-only summaries. Generated BMAD stories,
reviews, retrospectives, and handoffs remain local planning state under
`_bmad-output/`.
