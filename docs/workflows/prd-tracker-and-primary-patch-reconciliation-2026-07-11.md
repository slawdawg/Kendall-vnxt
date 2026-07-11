# PRD Tracker And Primary Patch Reconciliation

Date: 2026-07-11
Status: metadata-only reconciliation; no product or source authority granted
Lane: `20260711-prd-tracker-and-primary-patch-reconciliation-doc`
Base: `origin/dev` at `6a5e05ff7200e2dea2a57ed5f00ae93345746544`

## Decision

The current operational-loop product slice is complete and its source supply
is exhausted. The local sprint tracker contains historical, duplicated manager
families and is not a license to create new product backlog. The primary
branch patch is owner-held because it removes control-plane safety invariants
and is not green. Keep this lane documentation-only; preserve the primary
checkout and every stale dirty workspace.

## Source authority

The source-owned BMAD authority for this slice is:

- `_bmad-output/planning-artifacts/epics.md` — document metadata is
  `status: complete`, with `completedAt: 2026-07-04`.
- `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md` — document metadata is
  `status: final`.

The source documents define the operational-loop scope and its completed epic
breakdown. The current durable refill evidence records 201 done source stories
and zero `backlog`, `ready`, `review-ready`, or `active` source stories.
Therefore the tracker below is reconciliation evidence, not a competing
source of product authority. No BMAD artifact is modified by this lane.

## Local tracker warning

`_bmad-output/implementation-artifacts/sprint-status.yaml` is a local,
historical implementation tracker for source key
`2026-07-04-operational-pipeline-action-loop`; it must not be treated as new
product backlog. The observed `development_status` counts are:

| Observed value | Entries |
| --- | ---: |
| `done` | 64 |
| `ready-for-dev` | 12 |
| `in-progress` | 5 |
| `review` | 4 |
| `optional` | 13 |
| Total | 98 |

The historical duplicate manager families are visible at
`_bmad-output/implementation-artifacts/sprint-status.yaml:75-122`: Epic 5
and Epic 7 each repeat the six manager stories as `ready-for-dev`, while Epic
22 repeats the same six-story shape with `in-progress`/`review` values. Those
values describe retained local tracker history, not current safe work. Do not
materialize, requeue, or dispatch those entries without a new source-owned
authority decision.

## Delivery and runtime reconciliation

- GitHub reports no open pull requests targeting `dev`; current `origin/dev`
  has no pending PR delivery surface.
- The authoritative operational-loop source supply is exhausted: 201 done,
  zero dispatchable source stories, and zero safe work supply. The existing
  `26-1-planning-only-bmad-refill-continuation` request remains
  `needs_review`; it does not create Epic 26 backlog or execution authority.
- The primary branch `agent/operational-pipeline-action-loop` has exactly four
  dirty owner paths: `AGENTS.md`,
  `docs/workflows/latest-prd-autonomous-bmad-loop-goal.md`,
  `scripts/lib/manager-control-plane/core.mjs`, and
  `tests/manager-control-plane.test.mjs`.
- The primary uncommitted patch is 157 additions and 2,327 deletions. Its
  manager-control-plane core/test portion removes or weakens authoritative
  worker assignment locks, lease/reservation identity checks, pane/session
  revalidation, and review-routing exclusions. The patch is not green and is
  not a valid baseline delivery candidate.
- The primary branch and its four dirty paths remain owner-held. This lane
  must not reset, clean, take over, reconcile by deletion, or deliver that
  patch.
- Remaining runtime/reconciliation debt is a stale or unavailable dispatcher
  summary/run state and 12 dirty stale workspaces. All 12 have preservation
  evidence; no dirty stale workspace is a cleanup candidate. The former
  `codex-6` missing-session record has already been logically retired through
  the exact-target gate; current worker evidence reports zero
  `retirement_blocked` records.

## Next safe order

1. Preserve the 12 dirty stale workspaces and their ownership/evidence; do not
   infer equivalence or obsolescence from current-dev lineage alone.
2. Reconstruct or retire the stale manager dispatcher/run state through the
   existing read-only and lifecycle gates; keep dispatch, lease issuance, and
   source mutation blocked while truth is unavailable.
3. Rerun preflight, resume-state, cycle-packet, assignment, stale-owner, and
   dirty-preservation evidence until the packets agree.
4. Have the owner reconcile the primary four-file patch against current
   `dev`, restoring and proving every assignment-lock, lease/reservation,
   pane/session, and review-routing safety invariant before any delivery.
5. Only after those gates are green, reassess the existing planning-only
   course-correction request. A new source-owned product decision is required
   before any post-slice backlog is materialized.

## Explicit stop lines

Stop immediately and retain metadata-only evidence if any of the following is
true:

- the authoritative PRD/epic status or source counts cannot be read;
- the dispatcher summary, lease truth, assignment report, or workspace
  ownership is stale, unavailable, ambiguous, or contradictory;
- a proposed action would treat local `sprint-status.yaml` history as new
  backlog, create Epic 26 work, dispatch a worker, issue a lease, or call a
  provider;
- a proposed action would reset, clean, take over, or deliver the primary
  dirty checkout or any stale dirty workspace;
- the primary patch still removes a safety invariant or its full verification
  is not green;
- any delivery lane is not at the exact reviewed head, has failing/unknown
  required CI, has unresolved actionable review feedback, or cannot prove
  exact-head merge and cleanup.

## Evidence commands

These commands are read-only evidence commands unless explicitly marked
otherwise by their own lifecycle gate:

```text
git fetch origin dev
git rev-parse origin/dev
git show origin/dev:docs/workflows/phase-0-current-state-reconciliation-and-next-lane-authority-2026-07-11.md
git status --short --branch
git diff --stat -- AGENTS.md docs/workflows/latest-prd-autonomous-bmad-loop-goal.md scripts/lib/manager-control-plane/core.mjs tests/manager-control-plane.test.mjs
rg -n 'status:|completedAt:|authoritative_prd:|^### Epic' _bmad-output/planning-artifacts/epics.md
rg -n '^(title|status|updated):' _bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md
awk '/^development_status:/{in_status=1;next} in_status && /^[^[:space:]]/{exit} in_status && /^[[:space:]]+[A-Za-z0-9._-]+:/{print}' _bmad-output/implementation-artifacts/sprint-status.yaml
node ./scripts/manager-preflight.mjs --summary-json
node ./scripts/manager-refill-plan.mjs --summary-json
node ./scripts/manager-stale-owner-inspection.mjs --summary-json
node ./scripts/manager-dirty-workspace-preservation.mjs --summary-json
gh pr list --state open --base dev --limit 100 --json number,title,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,updatedAt,url
```

The commands must be run outside a sandbox boundary when their documented
preflight packet requires `git`, `gh`, or `tmux` child-process evidence. A
sandbox failure is not evidence that runtime state is healthy or exhausted;
retain the boundary classification and stop.

## Scope and mutation record

Changed path in this lane: this new documentation file only. No generated BMAD
artifact, source file, test, policy file, worker, assignment, lease, tmux
session, stale workspace, or primary checkout was modified.
