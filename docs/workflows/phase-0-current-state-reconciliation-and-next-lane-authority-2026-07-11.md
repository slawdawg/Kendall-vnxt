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

- The audited pre-artifact baseline was `origin/dev` at
  `daadcdc5b4aeac84ce4faea669f837d0ae73b46d`, including the merged Gate 5/6
  terminal backlog and readiness gates, the Phase 0 reconciliation artifacts,
  the post-merge course-correction policy update, the refreshed post-merge
  audit handoff, the stale merged-assignment closeout gate repair, and the
  exact-task duplicate-manifest selector fix. The delivery history below
  records the docs PRs that carried this artifact afterward.
- PR inventory is empty: no open pull requests target `dev`.
- Epic 25-1 (#473), Epic 25-2 (#474), the earlier 24-1 fixture stabilization
  (#461), the Phase 0 reconciliation (#485), the post-merge policy update
  (#488), the post-merge audit refresh (#489), the stale merged-assignment
  closeout repair (#491), the exact-task duplicate-manifest selector fix
  (#492), and this durable Phase 0 audit refresh (#493) are merged. There is
  no open PR available for merge or review-fix work.
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
- Current read-only preflight reports no safe work supply or dispatchable lanes;
  the authoritative PRD source is present and exhausted, while dispatcher state
  remains unavailable/stale.
- Assignment inventory reports the two formerly orphaned PR-backed records as
  closed with `stale_merged_pr_record_cleanup` evidence. Canonical stale-owner
  inspection covers 12 remaining targets: all 12 require dirty-worktree
  preservation, with zero clean cleanup candidates and zero takeover candidates.
- The three clean no-PR stale lanes previously eligible for integrated cleanup
  were removed through the governed cleanup gate and their assignments closed.
- Workspace orientation reports 8 tmux panes, 4 manager-owned panes, 2
  unmanaged panes, and 2 panes whose recorded worktrees are missing.
- Worker posture is 0 active, 4 warm, and 2 retirement-blocked. Usage is
  normal with 93% remaining; weekly usage is unavailable and must not be
  treated as pressure. CPU and RAM posture are normal.

## Runtime repair gate

The exact outside-sandbox preflight at 2026-07-11T17:31Z confirmed that the
manager runtime is read-only and blocked: the stale run is
`manager-20260706-001` in `starting` state, dispatcher freshness is unknown,
safe work supply is zero and the authoritative PRD has no remaining backlog.
Tmux
orientation found 8 panes, 4 manager-owned panes, 2 unmanaged panes, and 2
missing-worktree references. No pane was mutated.

The exact stale-owner inspection covered 12 targets. The sanitized target
`3-3-execution-completion-and-failure-evidence` was proven absent and its
assignment was closed by the governed `close-assignments --apply` command after
the operator approved any stale cleanup. Three clean no-PR stale lanes were
then removed through the exact integrated-cleanup gate and their linked
assignments reconciled. The current packet reports 12 dirty stale workspaces
with bounded preservation evidence, zero clean cleanup candidates, and zero
takeover candidates. No dirty workspace was deleted, no takeover was applied,
and no worker mutation, dispatch apply, provider call, or runtime merge was
performed.

## Post-merge delivery audit

The scoped policy/documentation lane was delivered and closed after the prior
runtime audit:

- PR #488 changed only `AGENTS.md` and the latest PRD's course-correction
  guidance. Its exact head was
  `88f1a6781a09c952c352fbe139e9533afc45db14` and its merge commit was
  `cc1a4e7ca0e0071e96dad01d40cd2aca68a12ba3`.
- Required CI jobs `changes`, `fast`, and aggregate `check` passed; the
  implementation jobs were correctly skipped for the docs-only change. Review
  submissions and inline review threads were empty.
- The managed lane worktree and local branch were removed only after exact-head
  ancestry verification. The remote branch was already absent after merge, and
  the lane manifest is closed with cleanup error `null`.
- No source implementation, worker state, stale assignment, takeover, or
  dispatcher state was changed by that delivery.
- PR #489 refreshed this handoff at exact head
  `cb74611ddd3420773555f0f114871d6aeeb88833` and merged as
  `a9c974b50a6d769691127dd0e1a6e120612a0e31`; its docs-only CI and exact-head
  cleanup gates passed, and its managed branch/worktree were removed.
- The canonical stale assignment cleanup was then applied separately with the
  explicit approval `Operator approval: I approve any cleanup of anything stale.`
  The assignment is now closed; no source worktree or branch was removed.

## Stale merged-delivery closeout repair

- PR #491 added the approval-gated `stale_merged_pr_record_cleanup` closeout
  mode. It requires a closed manifest, explicit merged PR metadata, absent
  worktree/local/remote branch evidence, and no open GitHub PR reference. It
  preserves merged PR evidence and continues to fail closed for unmerged or
  open PR evidence. Its exact head was
  `2444813bc4d42f1f7d3049a7c796b299e677ab14`; it merged as
  `cc97feb2c82086b158cf51afe28e99c98de31fe9`.
- PR #491 also fixed integrated cleanup to pass approved ownership-takeover
  options through linked assignment closeout, preventing a manifest from
  becoming `cleanup_partial` after its worktree and branch were already
  removed. The full nested workspace integration suite and CI fast/static
  gates passed; the lane was cleaned at exact head.
- PR #492 fixed duplicate closed-manifest selection to prefer an exact
  assignment task ID before falling back to source-assignment ID. Its exact
  head was `9a4e99e5833425fc87d1b0b59daec71ddc54ddb8`; it merged as
  `9796f21274a500006a32e548002bede777de6478`. The full nested workspace
  integration suite and CI fast/static gates passed; the lane was cleaned at
  exact head.
- PR #493 refreshed this durable handoff at exact head
  `70397f8dfae77b234e8c1ad38929f0d984d999ca` and merged as
  `daadcdc5b4aeac84ce4faea669f837d0ae73b46d`. Its documentation checks,
  fast CI gate, and exact-head cleanup gate passed.
- PR #494 corrected the baseline wording above at exact head
  `31e6ed449e06ffec3190e6098ceb0934d10e5d0c` and merged as
  `c2c2915d4037e07045b7fc891aee783b7dbfeba3`. Its fast CI gate and
  exact-head cleanup gate passed.

## Canonical stale-record cleanup closeout

Target: `3-3-execution-completion-and-failure-evidence`

Evidence: the exact dry-run reported `worktreeStatus: missing`, absent local
and remote branch heads, no PR references, and `staleRecordCleanupEligible:
true`. No source files or active worktree were attached to this record.

The governed mutation was applied successfully after explicit operator
approval. The target-specific command was:

```text
node ./scripts/codex-workspace.mjs close-assignments --ids 3-3-execution-completion-and-failure-evidence --allow-stale-record-cleanup --approval "<explicit operator approval>" --apply
```

The closeout does not authorize takeover or cleanup of the remaining dirty or
ambiguous lanes. Their preservation and ownership gates remain active.

The approved stale merged-delivery closeout was then applied to the two
remaining PR-backed assignment records:

- `read-only-evidence-polish` closed against exact manifest
  `20260622-read-only-evidence-polish`, preserving merged PR #189 evidence.
- `verification-surface-hardening` closed against exact manifest
  `20260623-verification-surface-hardening`, preserving merged PR #191
  evidence. The exact-task selector repair prevented the older duplicate PR
  #187 manifest from being selected.

Both records retain the explicit approval and bounded closeout evidence. No
worktree or branch existed for either record, and no dirty workspace was
mutated.

## Staged-lane recovery audit

The exact stale lane `20260710-fix-booting-promotion-second-review` was
inspected read-only after the exact governed takeover preview identified its
dirty worktree, stale owner heartbeat, absent remote branch, and no PR. Its
staged implementation is substantial but is not delivery-ready on that old
branch base: the manager-control-plane suite reported 447 passing and 6
failing tests. The failures were in older handoff, pointer-receipt, tmux
format, submit-pending, and question-answer fixtures.

The same six named cases pass on a clean `origin/dev` recovery lane, and the
full current manager-control-plane suite passes 463/463 on `origin/dev` at
`11f6cd7a0d42648e375719ce219e2b1ca9719f24`. This establishes the stale-lane
failures as old-base drift rather than a current `dev` regression. No staged
files were changed, no takeover was applied, and no dirty worktree was
cleaned. If the staged booting-reviewer safety work is still needed, it must
be ported and re-reviewed as a fresh current-baseline change; the stale lane
remains preservation-gated.

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
debt is stale run/dispatcher state, 12 dirty workspace preservation packets,
missing tmux/worktree orientation, and absent current source evidence in the
refill packet. The previously ambiguous PR-backed assignment records and
clean orphaned stale lanes are reconciled. These are reconciliation debts, not
permission to invent post-slice product work.

## Required repair order

1. Preserve all dirty stale-worktree evidence; the canonical stale-record and
   clean orphaned-lane cleanups are complete and must not be repeated.
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

The next safe work is reconciliation of the 12 dirty stale lanes and the
primary-checkout safety patch through their existing ownership, preservation,
verification, and PR gates. No clean stale cleanup or takeover candidate is
currently eligible. After runtime state is coherent and the primary patch is
reconciled, revisit the existing non-executing
`docs/workflows/adaptive-scoring-decision-prep.md` contract and
`pnpm run check:adaptive-scoring`; no score may be computed or used yet.

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
- `node ./scripts/manager-dirty-workspace-preservation.mjs --summary-json`
- `pnpm run check:adaptive-scoring`
- `pnpm run check:authority-readiness`
- `pnpm run check:branch-protection-readiness`
- `pnpm run check:delivery-readiness`
- `pnpm run check:cleanup-automation`
- `gh pr list --state open --base dev --limit 100 --json number,title,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,updatedAt,url`

All outputs above are metadata-only summaries. Generated BMAD stories,
reviews, retrospectives, and handoffs remain local planning state under
`_bmad-output/`.
