# ADR: Opt-in Staged Epic Delivery Pilot

Date: 2026-07-17
Status: **DOCUMENTATION-ONLY PILOT CONTRACT / STANDARD DELIVERY DEFAULT**
Scope: low-risk maintenance planning; no runtime, worker, provider, GitHub, or cleanup implementation

## Decision

Kendall keeps `standard-delivery` as the default delivery mode. An operator may
explicitly opt a bounded, low-risk maintenance epic into a provisional
`epic-batch` mode when the epic satisfies the admission gates in this ADR.

`epic-batch` groups related, independently verifiable slices in one managed
epic branch/worktree. Each slice remains attributable, testable, reviewable,
and reversible. GitHub delivery is deferred until the final checkpoint unless
a split trigger requires an earlier standard-delivery PR.

This ADR defines a planning contract only. It does not add a mode flag, change
the manager, create a `finish-epic` command, grant merge or cleanup authority,
launch workers/providers, or alter source, auth, secrets, deployment, schema,
or runtime behavior.

## Delivery modes

| Mode | Default | Delivery unit | Use |
| --- | --- | --- | --- |
| `standard-delivery` | **Yes** | One reviewed PR per slice | All work unless `epic-batch` is explicitly approved. |
| `epic-batch` | No; opt-in only | One final reviewed PR for the pilot epic | Related low-risk maintenance slices that pass admission and remain below every provisional limit. |

An opt-in records the epic owner, decision reference, base revision, expected
slices, provisional limits, evidence location, rollback plan, and explicit
split authority. Generic “continue” language is not an opt-in.

## Non-authority and exclusions

This pilot does not authorize:

- authentication, authorization, secrets, credentials, security fixes, schema
  or data migrations, deployment/release automation, provider calls, worker
  launch, or production mutation;
- live, bounded-live, or production Epic 25 work;
- hidden mid-epic commits, pushes, PRs, merges, branch deletion, worktree
  removal, or evidence deletion;
- bypassing required checks, review threads, ownership heartbeats, stale-lane
  recovery, or operator approvals.

High-risk or urgent corrective work remains `standard-delivery`, even when it
is small. A later risk discovery immediately suspends batching and invokes the
split procedure.

## Provisional pilot limits

The following limits are provisional and must be reassessed from pilot evidence:

| Limit | Provisional ceiling | Split trigger |
| --- | --- | --- |
| Related slices | 3–4 slices | A fifth slice is proposed, or the work cannot remain independently verifiable. |
| Age | 5 business days | Measure from `opened_at` using a UTC Monday–Friday clock; holidays do not extend the ceiling. At the start of the sixth UTC weekday, split or hold unless an approved course correction is recorded. Any calendar ambiguity is a split/hold trigger. |
| Diff size | 20 changed files **or** 1,000 net changed lines | Either threshold is exceeded. Count changed paths after excluding approved generated/local evidence; when the count is ambiguous, split conservatively. |

Exceeding any ceiling requires a split or an explicit course-correction
proposal with impact analysis and approval rationale. Limits cannot be waived
retroactively after delivery.

## Slice and checkpoint contract

### Slice admission

Before a slice is added, record its objective, owner, allowed paths, expected
verification, rollback, and relationship to the epic. The slice must be
low-risk, locally testable, and separable from the other slices. The managed
branch must start from a refreshed, recorded base revision.

### Slice closeout

Before the next slice begins, record focused verification, changed-file scope,
diff hygiene, residual risks, and the exact slice commit. A failed or
ambiguous check holds the lane; it is not hidden by moving to the next slice.

### Checkpoints

Run a checkpoint after every one or two slices, and whenever ownership,
scope, risk, or base state changes. A checkpoint must:

1. refresh from the expected base branch and record the resulting base/head;
2. reconcile the manifest, owner heartbeat, worktree, branch, and allowlisted
   diff;
3. rerun focused checks for the new slices and relevant aggregate checks;
4. obtain checkpoint review of scope, evidence, rollback, and split triggers;
5. stop for operator direction when a gate is missing, contradictory, stale,
   or outside the approved authority.

No checkpoint authorizes final delivery by itself.

## Manifest and evidence proposal

The future workspace manifest/evidence contract should retain metadata and
references, not raw prompts, completions, reasoning traces, provider payloads,
secrets, or unnecessary source copies. Proposed fields are:

```text
EpicBatchManifest
  mode: "epic-batch"
  epic_id
  owner
  decision_ref
  base_branch
  base_revision
  epic_branch
  worktree
  opened_at
  age_calendar: "UTC Monday-Friday; holidays do not extend the ceiling"
  age_limit
  slice_limit
  file_limit
  line_limit
  slices[]: { slice_id, objective, owner, paths, commit, checks, rollback_ref }
  checkpoints[]: { checkpoint_id, slices, base_revision, head, checks, review_ref, result }
  split_triggers[]
  final_verification_ref
  final_review_ref
  final_head
  rollback_ref
  cleanup_plan_ref
  cleanup_result_ref
```

The manifest is evidence, not authority. It must fail closed on missing owner,
unexpected path, stale heartbeat, dirty worktree, unresolved review, failed
check, ambiguous base/head, or an unrecorded split trigger.

## Final delivery and cleanup design

At epic close, a future guarded workflow may perform the following sequence
only after the required authority is separately present:

1. freeze the managed lane and preserve the final manifest;
2. refresh the base branch and rerun aggregate verification;
3. run one comprehensive review over the exact final diff;
4. reconcile exact head, checks, review threads, changed-file allowlist,
   rollback, owner, and residual risk;
5. create or update the single final PR targeting the expected base;
6. merge only the exact reviewed head when all delivery gates pass;
7. record the merge result and rollback reference;
8. after merge evidence is durable, remove only the named managed worktree,
   local branch, and remote lane branch.

Any failure holds delivery and preserves the lane for inspection. Cleanup is
never inferred from a green check or a closed PR; it requires post-merge
evidence and target-specific cleanup authority.

## Split triggers and recovery

Split back to `standard-delivery` when any of the following occurs:

- a provisional limit is reached or measurement is uncertain;
- the diff touches auth, security, secrets, credentials, schemas, deployment,
  providers, workers, authority, production, or urgent corrective behavior;
- a slice cannot be independently tested, reviewed, attributed, or reverted;
- the base branch advances materially, ownership becomes stale, or the
  worktree/manifest is dirty or ambiguous;
- a required check, review, evidence reference, rollback path, or cleanup
  target is missing, failed, or inconclusive;
- the operator requests immediate delivery.

Recovery is to stop the batch, preserve evidence, record the trigger, refresh
from the approved base, and create a scoped course-correction proposal when
the work should continue. The safe rollback is to revert the affected slice
commit(s) or abandon the unmerged branch; do not rewrite shared history.

## Pilot acceptance and reassessment

The pilot is successful only when every slice was locally verified and
reviewed, checkpoints were recorded, the final PR was the only delivery unit,
the exact final head and rollback were captured, and cleanup evidence was
complete. A retrospective must recommend whether to retain, narrow, expand,
or retire `epic-batch`. Until that retrospective is accepted,
`standard-delivery` remains the preferred default.

The pilot does not alter Epic 25 authority. Epic 25 remains subject to its
separate readiness conditions and live-operation hold.
