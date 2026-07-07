# Manager Worker Retirement Policy Handoff

Date: 2026-07-07
Status: ready for planning and implementation
Related skill: `.agents/skills/kendall-manager-control-plane/SKILL.md`
Related scripts:
- `scripts/manager-worker-retire.mjs`
- `scripts/manager-worker-warm.mjs`
- `scripts/manager-worker-handoff.mjs`
- `scripts/manager-worker-progress.mjs`
- `scripts/manager-lane-advance.mjs`
- `scripts/manager-worker-clean-cycle-observer.mjs`

## Purpose

Codex worker sessions should not persist indefinitely after their assigned work
is delivered. The manager should prefer clean closure and cheap relaunch over a
large long-lived worker pool. Reuse is allowed only when queue pressure, usage,
resource posture, and worker context make reuse safer than retirement.

This handoff defines a future implementation lane for smart worker retirement:
workers request retirement when their lane is complete, and the manager acts as
the authoritative cleanup actor that retires stale completed or warm-expired
manager-owned workers.

## Start Prompt

```text
Use docs/workflows/manager-worker-retirement-policy-handoff.md as the source
artifact. Implement the next safe slice of manager-owned Codex worker retirement
policy. Reuse the existing manager-worker-retire, worker progress, warm-worker,
handoff, lane-advance, and clean-cycle observer gates. Do not terminate unknown
or non-manager-owned sessions. Dry-run first, preserve metadata-only evidence,
add focused tests, and stop before any new authority expansion.
```

## Iterated Conclusion

The right model is not "keep workers alive because launch is expensive" and not
"kill everything after every PR." The right model is a bounded lifecycle:

```text
assigned -> active -> checkpointed -> review_ready -> delivery_running
-> delivered -> cleanup_complete -> retired_clean_requested
-> retired_logical -> retired
```

With blocked states:

```text
blocked_question
blocked_review
blocked_delivery
blocked_cleanup
retirement_blocked
parked
recovery_required
```

The manager owns reassignment and physical closure. Workers may request
`warm_available`, but they should not autonomously grab unrelated work or close
their own tmux/Codex session in the initial implementation slices. If no
compatible queue item is immediately available, or if warm TTL expires, the
worker should request retirement and wait for manager routing.

## Canonical State And Code Vocabulary

Future implementation should treat this section as the controlling vocabulary.
Other names in examples are descriptive only unless they map to these canonical
values.

Worker lifecycle states:

- `active`: worker has a valid active assignment, gate, question, or handoff
  root.
- `warm_available`: worker is idle only under an unexpired warm lease and has
  passed operational and context hygiene gates.
- `retirable`: no live root remains and no blockers are present; dry-run may
  select the worker.
- `retirement_blocked`: one or more blockers prevent clean retirement or reuse.
- `retired_logical`: worker is removed from capacity and normal pings; process
  may still exist.
- `retiring_physical`: physical close is in progress under dry-run/apply proof.
- `retired`: manager-owned session is closed or verified absent and metadata is
  finalized.
- `abandoned`: manager-owned worker was closed or verified absent through the
  safe-abandonment path with partial evidence and a recovery breadcrumb.

Worker request states:

- `retired_clean_requested`: worker requests manager retirement after a complete
  final checkpoint.
- `warm_available`: worker requests bounded manager-owned reuse.
- `retirement_blocked`: worker reports it cannot safely retire or be reused.

Packet field aliases:

- Use snake_case in persisted records and reason/blocker codes.
- Dashboard or JSON packet fields may use camelCase aliases such as
  `retiredLogical` or `retirementBlocked`, but they must map back to the
  canonical snake_case lifecycle states.
- `retired_clean` is descriptive shorthand only; persisted worker requests
  should use `retired_clean_requested`.

Blocker and reason code ownership:

- Additions must be made in the `Retirement Reasons` or `Retirement Blockers`
  sections before use.
- Existing readers must tolerate unknown future codes by treating them as
  blocked or non-actionable, never as retirable.
- Synonyms are not allowed in new code. For example,
  `cross_lane_dependency_unexternalized` is the canonical blocker, not
  `dependency_not_externalized`.

## Policy Principles

1. **Clean closure beats indefinite persistence.**
   A finished worker should request manager retirement once delivery and cleanup
   evidence is recorded unless the manager has a concrete next assignment.

2. **Reuse is explicit and short-lived.**
   Warm workers are a bounded optimization, not a default steady state.

3. **Manager-owned only.**
   Retirement gates may mutate only manager-owned `codex-*` worker sessions and
   records. Unknown, unmanaged, or non-manager-owned tmux sessions remain
   orientation evidence only.

4. **Delivery completion means more than PR opened.**
   A worker is not "done" until the lane is merged or explicitly parked,
   cleanup is complete or explicitly blocked, checks/review state is recorded,
   and a compact final checkpoint exists.

5. **No invisible cleanup.**
   Every worker retirement request or manager retire action must leave
   metadata-only evidence: worker id, assignment id, reason, gate, result,
   blocker if any, and recovery path.

6. **No raw payload retention.**
   Retirement evidence must not retain raw prompts, completions, reasoning
   traces, provider payloads, secrets, tmux scrollback, or unnecessary source
   copies.

## Done Contract For Workers

A worker may request retirement or warm reuse only after writing a final
checkpoint with:

- `worker_id`
- `assignment_id`
- `task_id`
- `branch`
- `delivery_state`
- `pr_url` or explicit parked reason
- `merge_state`
- `cleanup_state`
- `verification_summary`
- `review_summary`
- `open_questions: 0`
- `unresolved_review_threads: 0` or explicit blocked reason
- `dirty_worktree: false` or explicit blocked reason
- `next_assignment_reserved: false`
- requested final state: `retired_clean_requested`, `warm_available`, or
  `retirement_blocked`

Checkpoint field canonicalization:

- Persisted final checkpoint fields should use camelCase names matching the
  final checkpoint validator.
- Worker-authored aliases using snake_case are accepted only at input boundaries
  and must be canonicalized before validation.
- Unknown or unmapped field aliases must fail validation as
  `no_final_checkpoint` or `blocked_state_mismatch`; they must not be silently
  ignored.

If any required evidence is missing, the worker should enter
`retirement_blocked` and wait for manager routing rather than exiting silently.
If any blocked evidence exists, including dirty worktree, unresolved review
threads, open material questions, pending cleanup, ambiguous identity, or failed
verification, the requested final state must be `retirement_blocked`.
`warm_available` is valid only when all operational and context hygiene gates
pass and all blocker fields are explicitly empty.

## Manager Retirement Eligibility

The manager must evaluate blockers before eligibility. If any blocker predicate
matches, the worker is `retirement_blocked` even when some eligibility
predicates also look true.

The manager may classify a manager-owned worker as retirable only when all are
true:

- worker record is manager-owned for the current run or explicitly delegated to
  the current manager;
- assignment is closed, done, delivered, merged, cleanup-complete, parked, or
  otherwise no longer active;
- no unresolved compact question is attached to the worker;
- no pending review feedback route exists;
- no pending delivery, PR check, merge, or cleanup gate is open;
- worktree state is clean or worktree cleanup is already complete;
- final checkpoint exists, or the worker is stale beyond a configured grace
  period and manager recovery inspection found no newer work;
- no next assignment is reserved for that worker.

The manager must classify as `retirement_blocked` instead of retiring when any
of these are true:

- active assignment remains;
- dirty worktree exists;
- PR checks are pending or failing;
- current review threads are unresolved;
- cleanup is not done and not explicitly blocked;
- worker belongs to another manager or unknown owner;
- prompt/input state is unknown and no recovery inspection exists;
- worker has a material unanswered question;
- branch/PR/assignment identity is ambiguous.

## Warm Reuse Policy

Warm reuse is allowed only when:

- usage state is `normal`;
- CPU/RAM posture is `normal` or acceptable `warm`;
- dispatchable queue work exists;
- worker is below warm TTL;
- worker has clean delivery/cleanup evidence for previous assignment;
- next lane is compatible enough that stale context risk is low;
- manager writes a new durable handoff file and explicitly assigns the worker.

Suggested defaults:

- max warm workers: `min(2, dispatchable_queue_count)`;
- warm TTL: 5-10 minutes or 2 manager cycles;
- retire warm workers first in `conserve`, `drain`, `manager_only`,
  `pressured`, or `critical` posture;
- prefer retirement over reuse when task domain changes substantially or when a
  context reset cannot be proven.

## Context Hygiene Gate

Worker reuse is not only a resource decision. It is a judgment-risk decision.
A worker can be operationally idle and still be a poor reuse candidate because
its context is contaminated by the previous lane.

Reuse requires both gates:

1. **Operational Cleanliness**
   - delivery state settled;
   - PR checks and review state settled;
   - merge or parked decision recorded;
   - cleanup complete or not applicable;
   - worktree clean or removed;
   - no compact questions open;
   - final checkpoint written.

2. **Context Cleanliness**
   - next task is in the same or compatible domain;
   - next task has the same authority surface or narrower authority;
   - worker session age is below TTL;
   - previous lane did not end parked, blocked, or ambiguous;
   - previous lane did not require unusual operator approval or authority
     expansion;
   - previous review feedback is resolved and not likely to bias the next task;
   - manager provides a fresh durable handoff file for the next assignment.

Retire instead of reuse when any of these are true:

- next lane changes from delivery/merge/cleanup to planning or implementation;
- next lane changes code surface substantially, such as manager scripts to
  dashboard or supervisor;
- previous lane had substantial review feedback, even if resolved;
- previous lane ended parked, deferred, blocked, or partially complete;
- previous lane has cleanup `blocked`, `pending`, unknown, or inconclusive;
- previous lane touched GitHub merge, cleanup, takeover, worker mutation,
  approvals, or other expanded authority;
- next lane requires discovery rather than mechanical follow-through;
- final checkpoint is missing.

Default stance: reuse is an exception. Relaunch is cheap compared with stale
judgment, hidden authority carryover, or context contamination.

## Worker Reachability Model

Retirement can be modeled like garbage collection. A worker remains alive only
while a valid root still references it. If no root reaches the worker, the
manager should classify it as `retirable` and collect it through the existing
retire dry-run/apply gate.

Reachability roots:

- active assignment lease;
- reserved next handoff;
- open compact question;
- pending review request or feedback route;
- pending delivery gate;
- pending merge gate;
- pending cleanup gate;
- unexpired warm lease;
- recovery inspection in progress;
- explicit operator steering to keep the worker warm.

Non-roots:

- historical assignment ownership;
- old tmux session existence by itself;
- previous successful checkpoint after delivery;
- old PR URL after merge and cleanup;
- stale worker heartbeat without current lease;
- manager desire to avoid relaunch cost.

Reachability states:

- `reachable_active`: active work still owns the worker.
- `reachable_blocked`: a live blocker still owns the worker.
- `reachable_warm`: warm lease or reserved handoff still owns the worker.
- `unreachable_retirable`: no valid root reaches the worker.
- `unreachable_leaked`: no valid root reaches the worker, but the session still
  exists beyond the retirement grace period.

Implementation implication:

- Cycle packets should report worker reachability counts.
- `manager-worker-retire.mjs` should prefer `unreachable_leaked` workers after
  safety checks.
- A live tmux session is evidence to inspect, not proof the worker should stay.
- A worker with no roots should not receive progress pings; it should be
  retired or reported as retirement-blocked.

## Logical And Physical Retirement

Separate "this worker is no longer useful capacity" from "close the process."

**Logical retirement**:

- worker is removed from active and warm capacity counts;
- worker is not eligible for new handoff;
- manager stops progress pings, review requests, and prompt repairs;
- dashboard shows `retired_logical` or `retirable`;
- assignment/workspace lifecycle remains intact;
- no tmux process is killed.

Logical retirement invariants:

- logical retirement never implies physical tmux/Codex closure;
- logical retirement never cleans worktrees, deletes branches, updates PR state,
  closes assignments, or mutates GitHub;
- logical retirement cannot be used as proof that physical retirement is safe;
- any physical action still requires fresh manager-owned dry-run/apply evidence.

**Physical retirement**:

- manager closes the selected manager-owned tmux/Codex session;
- worker record becomes `retired`;
- ledger records the retire event and reason;
- only allowed after dry-run evidence proves manager ownership, no reachable
  roots, no blockers, and exact selected session identity.

Freshness requirement:

- physical apply must re-check current worker identity, manager ownership,
  lifecycle state, reachable roots, blockers, and dry-run evidence hash
  immediately before closing the session;
- a dry-run packet is stale if worker state, assignment state, root set,
  blocker set, session identity, or evidence hash changed after dry-run;
- stale dry-run evidence blocks apply as `reachable_root_present`,
  `identity_ambiguous`, or the most specific blocker.

Why split them:

- logical retirement can happen as soon as the worker is no longer safe or
  useful to reuse;
- physical retirement may need stronger proof and can be delayed without
  letting the worker affect scheduling;
- failed physical retirement should not put the worker back into active
  capacity;
- operator-visible dashboard can distinguish "not used anymore" from "process
  still needs cleanup."

Suggested states:

- `retirable`: safe candidate, not yet logically removed.
- `retired_logical`: removed from scheduling and pings, process may still
  exist.
- `retiring_physical`: dry-run/apply gate in progress.
- `retired`: record updated and manager-owned session closed or verified absent.
- `retirement_blocked`: logical/physical retirement blocked by explicit reason.

## Worker Lifecycle Is Not Lane Lifecycle

Retiring a worker session must not imply anything about assignment, story, PR,
or workspace completion. Worker lifecycle and lane lifecycle are separate
state machines.

Worker retirement may happen while the lane is:

- delivered and awaiting manager review;
- review-ready;
- parked by policy;
- blocked by operator decision;
- awaiting PR checks;
- awaiting merge;
- awaiting cleanup;
- reassigned to another worker;
- closed already.

Rules:

- `worker.retired` does not set `assignment.status = closed`.
- `worker.retired` does not set story status to done.
- `worker.retired` does not imply PR merged.
- `worker.retired` does not clean worktrees or branches.
- assignment/lane closure must still happen through existing
  `codex-workspace`, review, delivery, merge, and cleanup gates.
- a retired worker should leave enough compact evidence for another worker or
  manager session to resume the lane if the lane is not closed.

This separation prevents process-capacity cleanup from corrupting product truth.

## Retirement Handoff Quality

Worker retirement should be graded by resumeability. A retirement is clean only
if the next actor can understand the lane from compact durable metadata without
reading raw tmux scrollback or provider output.

Quality levels:

- `complete`: next actor can resume from metadata only.
- `partial`: next actor can resume, but must inspect bounded source/worktree or
  PR state.
- `poor`: retirement is blocked because evidence is insufficient.

Minimum evidence for `complete`:

- assignment id and task id;
- worker id and session id;
- lane lifecycle state;
- latest compact checkpoint;
- delivery/review/cleanup state;
- verification summary;
- open blockers/questions, or explicit `none`;
- next safe action;
- recovery path;
- reason for retirement;
- whether another worker/manager may resume.

Examples:

- A delivered, merged, cleaned lane with final checkpoint and no open questions:
  `complete`.
- A parked lane with explicit parked reason and next safe action:
  `complete` or `partial`, depending on evidence detail.
- A worker with no final checkpoint and unknown prompt state: `poor`, retire
  blocked unless recovery inspection proves no newer work.

Implementation implication:

- `manager-worker-retire.mjs` should report `handoffQuality`.
- Physical retirement should require `complete`, except emergency/resource
  retirement may allow `partial` with explicit recovery path.
- `poor` should route to recovery inspection, final checkpoint request, or
  retirement-blocked report.

## Worker Leak Detector

Before broad retire apply behavior, add a read-only leak detector. The detector
should report lifecycle mismatches without mutating tmux, worker records,
assignments, worktrees, branches, PRs, or cleanup state.

Leak classes:

- `session_without_worker_record`: manager-owned-looking tmux session exists
  without a matching worker record.
- `worker_record_without_session`: worker record says active/warm, but tmux
  session is absent.
- `active_worker_closed_assignment`: worker active while assignment is closed,
  done, merged, or cleanup-complete.
- `warm_ttl_expired`: warm worker exceeded TTL or cycle limit.
- `unreachable_worker`: no valid reachability root points at the worker.
- `duplicate_workers_for_assignment`: more than one non-retired worker references
  the same assignment.
- `assignment_points_to_retired_worker`: active assignment references a retired
  worker.
- `stale_heartbeat_no_root`: stale heartbeat exists with no active lease,
  handoff, question, or gate.
- `retired_record_live_session`: worker record is retired but the manager-owned
  tmux session still exists.

Suggested report fields:

- `workerId`
- `sessionName`
- `assignmentId`
- `leakClass`
- `reachableRoots`
- `handoffQuality`
- `retireEligibility`
- `blockers`
- `nextAction`
- `mutation: none`

Implementation slice:

- Add `node ./scripts/manager-worker-leak-report.mjs --summary-json`, or extend
  `manager-worker-progress.mjs` if that is the established ownership boundary.
- Feed leak counts into cycle packets and dashboard summaries.
- Use the leak report as evidence for future retire dry-runs.
- Do not auto-retire from the leak detector itself.

## Manager Attention Suppression

Logical retirement should immediately reduce manager noise, even before physical
process cleanup succeeds. Once a worker is `retired_logical`,
`unreachable_retirable`, `unreachable_leaked`, or classified by the leak
detector, suppress normal active-worker actions for that worker.

Suppress:

- progress pings;
- prompt probes;
- submit-pending repairs;
- review delegation attempts;
- review feedback routes;
- handoff attempts;
- lane-advance pings;
- repeated status escalation as active work.

Allow only:

- read-only leak/retirement reports;
- bounded recovery inspection when handoff quality is `poor`;
- explicit retire dry-run/apply gate;
- operator-visible blocked-retirement summary.

Why:

- prevents repeated manager churn against sessions already known to be done or
  unreachable;
- keeps the operator focused on active work and real blockers;
- lets logical retirement improve system behavior even when physical retirement
  is delayed by evidence or sandbox boundaries.

## Capacity Accounting

Worker target decisions must use useful capacity, not raw tmux session count.
A manager can have six sessions and still have only two useful workers if the
others are logically retired, expired warm workers, blocked from retirement, or
leaked.

Suggested capacity fields:

- `activeUseful`: active workers with reachable assignment roots.
- `warmReusable`: warm workers that pass operational and context hygiene gates.
- `reservedHandoff`: workers reserved for a specific next lane.
- `retirable`: workers safe to retire but not yet physically closed.
- `retiredLogical`: workers removed from scheduling, process may still exist.
- `retirementBlocked`: workers that cannot be retired because evidence or safety
  blockers remain.
- `leaked`: workers/sessions with no valid reachability root.
- `unknownOwnership`: sessions that are orientation evidence only.

Capacity bucket rules:

- Each worker must have exactly one primary lifecycle bucket for planning:
  `activeUseful`, `warmReusable`, `reservedHandoff`, `retirable`,
  `retiredLogical`, `retirementBlocked`, `leaked`, or `unknownOwnership`.
- Secondary tags such as `keystoneRole`, `handoffQuality`, `abandoned`, or
  `safeAbandonment` may annotate a worker but must not double-count capacity.
- If a worker appears to match multiple primary buckets, classify as
  `retirementBlocked` with `identity_ambiguous` or the most specific conflict
  blocker until the lifecycle state is repaired.

Dispatch and warm planning should use:

```text
usable_capacity = activeUseful + warmReusable + reservedHandoff
retirement_debt = retirable + retiredLogical + retirementBlocked + leaked
```

Policy implications:

- Do not launch more workers merely because raw active count is low if
  retirement debt is high and resources are pressured.
- Retire or logically suppress retirement debt before warming more workers when
  queue pressure is low.
- Dashboard should show useful capacity separately from retirement debt.
- Heartbeats should avoid implying leaked or blocked-retirement workers are
  active capacity.

## Retirement Resume Breadcrumb

Before a worker exits, or before the manager marks it logically retired, the
system should preserve a compact resume breadcrumb. The breadcrumb is a pointer,
not a transcript.

Required fields:

- `workerId`
- `assignmentId`
- `taskId`
- `branch`
- `worktreePath`
- `laneStatePath`
- `latestCheckpointRef`
- `deliveryEvidenceRef`
- `cleanupEvidenceRef`
- `nextActionOwner`: `manager`, `worker`, `operator`, or `none`
- `nextCommand`
- `stopLines`
- `retirementReason`
- `handoffQuality`
- `createdAt`

Rules:

- Breadcrumbs must be metadata-only.
- Breadcrumbs must not include raw prompt text, completions, reasoning traces,
  provider payloads, secrets, tmux scrollback, or source dumps.
- A `complete` handoff-quality retirement should have a breadcrumb that lets the
  manager resume or reassign without additional context reconstruction.
- A missing breadcrumb should downgrade handoff quality or block retirement
  unless emergency/resource posture requires partial retirement.

Suggested storage:

```text
<manager-run-state>/worker-retirement-breadcrumbs/<run-id>/<worker-id>/<epoch-id>.json
```

The breadcrumb should also be referenced from the worker record and any
retirement ledger event.

Canonical lookup key:

- `epochId` is required for every breadcrumb.
- When assignment id exists, `epochId` should be derived from
  `<assignmentId>#<epochSequence>`.
- Assignment-less warm or recovery workers use a generated
  `<workerId>#warm#<epochSequence>` or `<workerId>#recovery#<epochSequence>`
  epoch id.
- Worker records should store the latest breadcrumb ref and preserve prior epoch
  refs as history; new epochs must not overwrite earlier breadcrumbs.

## Operating-Mode Retirement Profiles

Retirement should respond to manager posture. A single static timeout will be
too aggressive during active delivery and too weak during drain, conserve, or
shutdown.

Suggested profiles:

| Mode | Retirement posture |
| --- | --- |
| `normal` | Keep only a short, context-clean warm pool when queue pressure justifies it. Retire unreachable and expired workers. |
| `conserve` | Stop warm expansion. Retire expired warm workers and delivered/no-queue workers. |
| `drain` | Stop new handoff. Let active delivery reach safe checkpoints. Retire completed and warm workers. |
| `manager_only` | No worker spend or new worker work. Retire all non-active warm/done workers when gates prove safe. |
| `pressured` | Hold active useful workers. Retire warm, expired, and leaked workers before considering new work. |
| `critical` | Physical retirement of manager-owned idle/warm sessions is allowed before touching active workers. |
| `shutdown` | Stop new dispatch. Logically retire only workers with no live roots; report active, question, review, delivery, cleanup, handoff, and recovery roots as blocked/held with resume breadcrumbs. |

Threshold evaluation order:

1. Always evaluate ownership, unknown identity, live roots, dirty worktree, PR,
   review, cleanup, and verification blockers first.
2. Apply the operating-mode profile only after hard safety blockers are known.
3. `critical` and `shutdown` may increase retirement urgency and allow
   safe-abandonment consideration, but they do not bypass manager-owned identity,
   dry-run proof, branch/PR/worktree preservation, metadata-only evidence, or
   recovery breadcrumb requirements.
4. A single critical resource signal may stop new dispatch and warm expansion,
   but it must not close active delivery, review, cleanup, question, or handoff
   roots.

Implementation implication:

- Cycle packet should include `retirementProfile`.
- `manager-worker-retire.mjs` should accept a profile/reason code instead of
  only individual recovery reasons.
- Continuous mode should choose retirement earlier in `conserve`, `drain`,
  `manager_only`, `pressured`, `critical`, and `shutdown`.
- Physical retirement still requires manager-owned identity and dry-run proof.

## Anti-Flapping Rules

Worker lifecycle must be stable across manager cycles. Retirement policy should
not create a new churn loop where the same worker bounces between `warm`,
`retirable`, `retired_logical`, and `retirement_blocked`.

Rules:

- Once a worker is `retired_logical`, it cannot return to `warm` or `active`
  without an explicit revive/reassign gate.
- Once retirement is blocked, do not retry the same retire action every cycle
  unless the blocker evidence changed.
- Once warm TTL expires, do not refresh the TTL unless a real manager-issued
  handoff is written.
- Once a leak is detected, suppress normal pings and prompt probes until
  reachability classification changes.
- Do not alternate between progress-signal and retire attempts for the same
  worker without a newer checkpoint or recovery-inspection result.
- Retirement apply commands should be idempotent: already-retired or
  already-absent manager-owned sessions should record `already_retired` rather
  than fail noisily.

Suggested metadata:

- `lastRetirementDecisionAt`
- `lastRetirementDecision`
- `lastRetirementBlockers`
- `retirementDecisionEvidenceHash`
- `retirementRetryAfter`
- `reviveRequired: true|false`

Implementation implication:

- Cycle packet should report suppressed retire retries separately from new
  retire candidates.
- The retire gate should compare current blockers with the previous blocker
  set before recommending another apply.
- A future revive gate, if needed, should be explicit and rare.

## Rare Revive Gate

If logical retirement exists, reversal needs a deliberate gate. A logically
retired worker must not become active again merely because a tmux session still
exists, a heartbeat appears, or the manager needs capacity.

Revive may be considered only when:

- a late compact checkpoint appears after logical retirement;
- operator explicitly asks to inspect or resume that exact session;
- reachability classification was wrong and a valid root is now proven;
- physical retirement failed but the session is still valid and needed;
- a reserved handoff existed but was not visible in the previous cycle.

Revive authority limits:

- revive must create a new assignment epoch and fresh manager handoff;
- revive does not restore prior GitHub, cleanup, provider, merge, or mutation
  authority unless the new handoff explicitly grants it;
- abandoned workers cannot be revived automatically; they require explicit
  operator approval and a recovery inspection packet;
- stale blockers and prior permissions must be copied only as metadata evidence,
  not as active authority;
- if context hygiene, authority surface, or source state is uncertain, prefer a
  fresh worker and keep the old session retired or abandoned.

Revive blockers:

- context hygiene fails;
- authority surface changed;
- session age exceeds revive TTL;
- previous lane had unresolved or ambiguous delivery/review/cleanup state;
- worker lacks final or current checkpoint;
- ownership is not manager-owned;
- another worker has already taken over the lane.

Revive result states:

- `revived_warm`: worker returns only as warm capacity after context check.
- `revived_assigned`: worker is explicitly reassigned through a handoff gate.
- `revive_blocked`: evidence insufficient; keep logical retirement.
- `revive_declined`: manager chooses fresh worker instead.

Implementation implication:

- Do not build revive before retire/leak reporting is stable.
- Revive should be rarer than retirement and visible in cycle summaries.
- Revive apply must be dry-run-proven, idempotent, and manager-owned only.

## Clean Retirement vs Safe Abandonment

Not all successful retirements have the same evidence quality.

**Clean retirement** means:

- worker wrote a final compact checkpoint;
- retirement breadcrumb exists;
- handoff quality is `complete`;
- assignment/lane state is known;
- no open roots or blockers remain;
- manager retires the session through the normal gate.

**Safe abandonment** means:

- worker cannot or did not write a final checkpoint;
- recovery inspection found no newer compact work;
- no assignment root points at the worker;
- no branch/PR/delivery/cleanup state is at risk;
- no dirty worktree or unsaved source evidence exists;
- session is stale, idle, or unreachable;
- manager records lower-confidence abandonment evidence before physical
  retirement.

Safe abandonment is acceptable only for manager-owned workers and should produce
handoff quality `partial`, not `complete`. It is allowed only in `critical`,
`shutdown`, or explicit resource-emergency posture, or when the operator
explicitly approves abandonment for the exact worker. In `normal`, `conserve`,
`drain`, `manager_only`, or `pressured` mode, partial evidence must classify as
`retirement_blocked` until recovery inspection either completes the evidence or
the operating mode changes.

Required safe-abandonment evidence packet:

- worker id, session id, assignment id when known, and epoch id;
- exact reason clean retirement failed;
- evidence proving manager ownership and exact session identity;
- evidence proving no live roots, dirty worktree risk, PR/review/cleanup risk,
  or newer compact checkpoint;
- possible state or context that may be lost;
- recovery path and next safe owner;
- authorization basis: `critical`, `shutdown`, `resource_emergency`, or explicit
  operator approval;
- timestamp, dry-run evidence hash, and metadata-only resume breadcrumb.

Suggested reason codes:

- `clean_retirement`
- `safe_abandonment_no_roots`
- `safe_abandonment_stale_idle`
- `safe_abandonment_session_absent`

Implementation implication:

- The retire gate should distinguish clean retirement from safe abandonment.
- Safe abandonment should require stronger negative evidence, similar to stale
  assignment cleanup: no live worktree risk, no branch/PR risk, no reachable
  assignment root, no recent checkpoint.
- Safe abandonment should never close the assignment unless existing assignment
  closeout gates separately prove it.

## Worker Handoff Retirement Contract

Retirement policy should be present in the worker handoff, not only in manager
cleanup. Every manager-issued worker handoff should tell the worker what to do
at completion.

Add to durable worker handoff templates:

```text
When this assignment reaches a safe stopping point or delivery is complete:
1. Do not claim unrelated new work.
2. Write a compact final checkpoint with delivery, review, cleanup, verification,
   blockers, and next-safe-action metadata.
3. Write or request a retirement breadcrumb.
4. Set requested final worker state to `retired_clean_requested` or
   `warm_available`.
5. If blocked, set `retirement_blocked` with the blocker reason.
6. Wait for manager routing; do not keep prompting indefinitely.
```

Worker handoff should also say:

- reuse is manager-owned, not worker-owned;
- worker may report availability but must not self-assign;
- final checkpoint is required before a clean retirement request;
- raw prompts, completions, reasoning traces, provider payloads, secrets, and
  tmux scrollback must not be retained;
- workers must not physically close their own tmux/Codex session in the initial
  implementation slices. A future self-close feature would require an explicit
  source-owned policy, complete final checkpoint, no live roots, no next
  assignment reservation, and manager-visible evidence before exit.

Implementation implication:

- Update `manager-worker-handoff.mjs` request file templates.
- Update review/development worker prompts if they have separate templates.
- Add tests that handoff files include the retirement contract.

## Cross-Lane Dependency Check

A worker can be process-clean but still hold continuity context needed by a
downstream lane. Clean retirement should require downstream-impact
externalization when the worker's lane created decisions, assumptions, or
contracts that another lane may depend on.

Before clean retirement, ask:

- Did this worker create a decision that downstream lanes need?
- Is that decision source-owned, or only in local evidence?
- Is there an active or queued dependent assignment?
- Does the final checkpoint name downstream impacts?
- Does the next worker need a decision breadcrumb?
- Did the lane change shared contracts, workflow semantics, authority gates, or
  data/state ownership?

Retirement handling:

- If no downstream dependency exists, continue normal retirement.
- If dependency exists and is source-owned or captured in compact evidence,
  retirement can remain `complete`.
- If dependency exists but is only in worker context, block clean retirement as
  `cross_lane_dependency_unexternalized`.
- If dependency existence is unknown, block clean retirement as
  `cross_lane_dependency_unexternalized` until the final checkpoint or source
  evidence explicitly proves no downstream impact.
- The worker should write a decision breadcrumb or source-owned doc/test/policy
  update before clean retirement.

Suggested blocker:

- `cross_lane_dependency_unexternalized`

Suggested evidence refs:

- `decision:<id>`
- `checkpoint:<id>`
- `source:<path>`
- `story:<id>`

## Retirement Pacing Policy

Retirement is a capacity-control action. A system can retire every worker
safely and still harm throughput if it drains warm or reusable capacity faster
than the manager can launch, reassign, or hand off replacements.

Pacing rules:

- When dispatchable queue count is low, retire debt before warming.
- When dispatchable queue count is high and resources are normal, preserve a
  small context-clean warm pool.
- In `normal` mode, retire completed/warm-expired workers in bounded batches.
- In `conserve`, `drain`, `manager_only`, `pressured`, `critical`, and
  `shutdown`, operating-mode policy may override throughput preservation.
- Never keep a worker solely for raw capacity if it fails context hygiene,
  reachability, or handoff quality gates.
- Do not let retirement debt grow without reporting it; blocked retirements
  should be visible even when throughput is prioritized.

Suggested batch controls:

- `maxRetirePerCycle`
- `minUsefulCapacity`
- `minWarmReusableWhenQueueHigh`
- `queueHighWatermark`
- `retirementDebtHighWatermark`

Example policy:

```text
if mode in [conserve, drain, manager_only, pressured, critical, shutdown]:
  favor retirement according to mode profile
else if dispatchable_queue_count >= queueHighWatermark:
  preserve minUsefulCapacity and minWarmReusableWhenQueueHigh
  retire only excess retirable/leaked workers this cycle
else:
  retire all dry-run-proven retirable workers up to maxRetirePerCycle
```

## Final Checkpoint Completeness Validator

A final worker checkpoint can lie by omission. Clean retirement should require a
machine-validated final checkpoint with explicit required fields and explicit
`none` values where no risk exists.

Required final checkpoint fields:

- `workerId`
- `assignmentId`
- `taskId`
- `branch`
- `laneState`
- `deliveryState`
- `reviewState`
- `cleanupState`
- `verificationCommands`
- `verificationResults`
- `skippedVerification` or explicit `null`
- `openBlockers`
- `openQuestions`
- `knownRisks`
- `downstreamImpacts`
- `dirtyWorktreeState`
- `prState`
- `nextSafeAction`
- `handoffQualityRequested`
- `retirementRequest`

Accepted aliases:

- Snake_case worker-authored fields such as `worker_id`, `assignment_id`,
  `delivery_state`, `cleanup_state`, and `dirty_worktree_state` may be accepted
  only when canonicalized to their camelCase forms before validation.
- Canonical persisted fields are camelCase.
- Alias collisions, unknown aliases, or conflicting values fail validation.

Validation rules:

- `verificationCommands` must list exact commands run, or `skippedVerification`
  must explain why none ran. When verification commands ran,
  `skippedVerification` may be explicit `null`.
- Allowed skipped verification reasons are `not_applicable`,
  `blocked_by_sandbox_boundary`, `blocked_by_missing_dependency`,
  `blocked_by_operator_hold`, or `blocked_by_resource_posture`.
- Skipped verification blocks warm reuse and physical retirement unless the
  reason is `not_applicable` or an explicit operator-approved parked/abandoned
  path records the residual risk.
- Skipped verification never proves PR delivery readiness by itself; delivery
  gates must apply their own existing review/check policies.
- `knownRisks`, `openBlockers`, `openQuestions`, and `downstreamImpacts` must
  be arrays; empty means explicit `none`.
- `nextSafeAction` is required even when the lane is done.
- `cleanupState` cannot be omitted; use `not_applicable`, `complete`,
  `blocked`, or `pending`.
- `dirtyWorktreeState` must be `clean`, `removed`, `not_applicable`, or
  `blocked`.
- `handoffQualityRequested=complete` is allowed only when all required evidence
  is present and no blocker arrays are non-empty.
- Retirement eligibility must fail fast on checkpoint validation errors before
  any warm reuse, logical retirement, physical retirement, or safe-abandonment
  decision.

Implementation implication:

- Add or extend a validator used by `manager-worker-progress.mjs`,
  `manager-lane-advance.mjs`, and `manager-worker-retire.mjs`.
- Clean retirement fails closed when the final checkpoint is incomplete.
- Incomplete checkpoint routes to `retirement_blocked` or
  `safe_abandonment` only after recovery inspection and negative evidence.

## Retirement Analytics As Quality Feedback

Retirement outcomes are manager-quality signals. A high count of safe
abandonment or blocked retirement is not normal cleanup; it means worker prompts,
handoffs, monitoring, or delivery gates need improvement.

Track:

- retirements by reason;
- clean retirement rate;
- safe abandonment rate;
- missing final checkpoint rate;
- retirement blocked count by blocker;
- revive attempts and successful revives;
- leaked session count;
- average warm duration;
- average worker lifetime;
- repeated retire retries suppressed by anti-flapping;
- workers retired after policy-blocked questions;
- workers retired after recovery submit unanswered.

Suggested quality triggers:

- safe abandonment rate exceeds threshold;
- missing final checkpoint rate exceeds threshold;
- same blocker appears in repeated cycles;
- leaked sessions persist beyond grace period;
- revive rate is non-zero for multiple cycles;
- retirement debt grows while queue remains healthy.

Trigger handling:

- record metadata-only future work;
- improve worker handoff template;
- improve final checkpoint validator;
- improve leak detector;
- adjust warm TTL or retirement pacing;
- route to `docs/workflows/tool-churn-rca.md` if repeated retire tooling fails.

## Worker Lifecycle Ecosystem Signals

Worker lifecycle health should be visible as a small ecosystem summary: what is
feeding healthy flow, and what is threatening it.

Nutrients:

- compact checkpoints;
- source-owned decisions;
- green exact-head checks;
- resolved review threads;
- clean worktrees;
- explicit cleanup state;
- queue clarity;
- manager-issued handoffs;
- final checkpoint completeness;
- retirement breadcrumbs.

Predators:

- stale context;
- ambiguous ownership;
- hidden PR state;
- warm pool overgrowth;
- missing final checkpoints;
- repeated progress pings;
- leaked sessions;
- retirement retry flapping;
- blocked cleanup gates;
- cross-lane decisions not externalized.

Suggested cycle/dashboard summary:

```json
{
  "workerLifecycleEcosystem": {
    "nutrients": {
      "completeCheckpoints": 3,
      "cleanWorktrees": 2,
      "resolvedReviewThreads": 4
    },
    "predators": {
      "missingFinalCheckpoints": 1,
      "leakedSessions": 2,
      "ambiguousOwnership": 0
    },
    "health": "watch"
  }
}
```

Health labels:

- `healthy`: nutrients present, predators low, retirement debt bounded.
- `watch`: some predators present, but active work is not at risk.
- `degraded`: retirement debt or missing evidence affects capacity decisions.
- `blocked`: worker lifecycle uncertainty blocks dispatch, review, delivery, or
  cleanup.

## Worker Succession Planning

Retirement and warming should be planned together. When a worker leaves, the
manager should decide whether its capacity niche should be filled, reused, or
left empty.

Succession options:

- `leave_empty`: queue is low, resources are constrained, or context hygiene
  favors fresh launch later.
- `reuse_warm`: existing warm worker passes operational and context hygiene.
- `launch_replacement`: queue is high, usage/resources allow, and warm capacity
  is insufficient.
- `reassign_existing`: another active/review worker can safely take the lane
  through a handoff gate.
- `manager_handles_next`: no worker needed; manager can finish review/delivery
  gate locally under existing authority.

Succession decision inputs:

- dispatchable queue count;
- useful capacity;
- retirement debt;
- resource posture;
- usage posture;
- domain compatibility;
- active review/delivery queue;
- worker warm TTL;
- manager steering mode.

Implementation implication:

- Cycle packet should include `workerSuccessionPlan`.
- `manager-worker-retire.mjs` should report replacement recommendation but not
  launch replacements itself.
- `manager-worker-warm.mjs` should consider retirement debt and succession plan
  before warming.
- Continuous mode should avoid a retire-then-immediately-warm loop unless queue
  pressure justifies replacement.

## Keystone Worker Classification

Some workers are temporarily high-leverage. They should not persist forever, but
retiring them requires stronger handoff and succession evidence.

Keystone roles:

- `reviewer`: holds review findings, follow-up context, or unresolved review
  routing.
- `delivery_executor`: owns finish-pr, PR gate, merge, or cleanup evidence.
- `architecture_context`: touched cross-cutting contracts, architecture, or
  manager policy.
- `operator_question_holder`: has an active material operator question.
- `dependency_coordinator`: changed or discovered dependencies affecting
  downstream lanes.
- `incident_recovery`: handling recovery, dirty workspace preservation, or
  blocked cleanup.

Keystone retirement requirements:

- final checkpoint completeness;
- cross-lane dependency check;
- retirement breadcrumb;
- succession plan;
- no unresolved review/PR/cleanup gate;
- explicit next owner when lane is not closed;
- handoff quality `complete`, unless emergency/resource retirement forces
  `partial` with recovery path.

Implementation implication:

- Worker records or progress summaries should include optional `keystoneRole`.
- Cycle packet should count keystone workers separately.
- Retire dry-run should explain extra blockers for keystone workers.
- Warm reuse should be more conservative for keystone workers because stale
  context and authority carryover risk are higher.

## Worker Succession Stages

As an optional dashboard and summary vocabulary, classify worker lifecycle using
ecological succession stages. These stages should supplement, not replace, the
concrete state machine.

Stages:

- `pioneer`: newly launched or warmed; no durable assignment output yet.
- `productive`: active useful work with reachable assignment root.
- `mature`: delivered/checkpointed; may be useful for short compatible
  follow-up.
- `senescent`: stale, context-heavy, warm TTL expired, or context hygiene risk
  rising; should move toward retirement.
- `decomposed`: retired; process gone or logically removed, durable evidence
  remains.

Policy use:

- `pioneer` workers need handoff or retirement if never assigned.
- `productive` workers get monitoring and progress support.
- `mature` workers can be reused only through context hygiene and succession
  gates.
- `senescent` workers should not get new pings except retirement/recovery
  gates.
- `decomposed` workers are evidence, not capacity.

Dashboard use:

- show stage alongside raw state;
- make `senescent` and `decomposed` visually distinct from useful capacity;
- show trends when workers spend too long in `mature` or `senescent`.

## Eliminate Indefinite Idle

`idle active` should not be a long-term valid state. It hides lifecycle debt.

Allowed non-terminal worker states must be one of:

- active with a reachable root;
- warm with TTL;
- blocked with explicit reason;
- retirable;
- retired logical;
- retiring physical.

Everything else should classify as one of:

- `leaked`;
- `retirement_blocked`;
- `reachability_unknown`;
- `pioneer_unassigned`;
- `senescent`.

Rules:

- A worker cannot remain idle without a warm lease.
- A worker cannot remain warm after TTL without handoff or retirement.
- A worker cannot remain blocked without a blocker code and retry/cooldown
  policy.
- A worker cannot remain active without assignment, question, gate, or handoff
  root.
- Dashboard should avoid a generic `idle` bucket unless it is immediately
  qualified by TTL, root, or blocker.

## Worker Lease Model

Combine retirement policy with queue and worker lease policy. A worker remains
eligible for active/warm capacity only while it holds a valid lease.

Lease types:

- `assignment_lease`: worker is actively assigned to a lane.
- `warm_lease`: worker is intentionally warm for bounded reuse.
- `handoff_lease`: worker has a reserved next handoff.
- `question_lease`: worker owns an open compact question.
- `review_lease`: worker owns review request or feedback route.
- `delivery_lease`: worker owns delivery, PR gate, merge, or cleanup step.
- `recovery_lease`: worker is under bounded recovery inspection or repair.
- `retirement_lease`: worker is selected by retire dry-run/apply gate.

Lease rules:

- Every lease has owner, reason, created time, expiry, evidence ref, and next
  action.
- A worker may have multiple leases, but at least one must be valid to remain
  active or warm.
- Expired lease with no replacement lease means `unreachable_retirable`.
- Lease conflict means canonical state `retirement_blocked` with blocker
  `handoff_pending`, `reachable_root_present`, or the most specific conflict
  blocker until resolved. `handoff_blocked` is descriptive wording only, not a
  persisted lifecycle state.
- A warm lease cannot be extended without a real handoff or explicit manager
  capacity decision.

Implementation implication:

- Reachability roots can be represented as leases.
- Capacity accounting can derive useful capacity from valid leases.
- Leak detector can report workers with no valid lease.
- Retirement gate can require a `retirement_lease` before physical close.

## Reverse The Burden Of Proof

Every manager cycle should ask: "Why should this worker stay alive?" A worker's
continued existence is not evidence of useful work.

Stay-alive proof can come from:

- valid lease;
- reachable active assignment;
- open compact question;
- pending review/delivery/cleanup gate;
- unexpired warm lease;
- recovery inspection in progress;
- explicit operator steering.

If no stay-alive proof exists:

- classify as `unreachable_retirable`;
- suppress normal active-worker actions;
- include in leak/retirement report;
- route to retire dry-run when policy and pacing allow.

This prevents the manager from waiting forever for explicit "done" signals that
may never arrive.

## Worker Startup Retirement Banner

Warm worker startup instructions should establish lifecycle expectations before
any assignment is handed off.

Suggested banner text:

```text
You are a manager-owned Kendall_Nxt Codex worker.
You are leased, not permanent.
Wait for a durable manager handoff file before changing files.
Do not claim unrelated work.
When assigned work reaches a safe stop or delivery completes, write a compact
final checkpoint and request `retired_clean_requested`, `warm_available`, or
`retirement_blocked`.
The manager may logically or physically retire this session when your lease
expires or no stay-alive root remains.
```

Warm reuse reset rules:

- manager must issue a fresh handoff and start a new epoch before reuse;
- worker must treat previous lane context as historical evidence, not active
  instruction;
- previous assignment-specific assumptions, approval scope, tool state, and
  pending commands must be cleared from active work;
- retained metadata is limited to checkpoint refs, breadcrumb refs, reason and
  blocker codes, and explicit manager-provided context;
- source state, branch, worktree, PR/review state, cleanup state, authority
  surface, and dependency impact must be revalidated before new edits;
- if reset evidence is incomplete, classify as `retirement_blocked` or retire
  instead of reuse.

Implementation implication:

- Update `manager-worker-warm.mjs` bootstrap prompt.
- Keep the banner short enough for safe tmux submission.
- Retain only redacted/banner metadata in evidence, not raw prompt payload.
- Add tests that warm-worker launch material includes the retirement banner
  concepts without retaining raw provider output.

## Retirement As Backlog Health Telemetry

Retirement outcomes should feed backlog and worker-target decisions.

Signals:

- Many `delivered_no_queue` retirements: queue may be empty or refill is needed.
- Many `leave_empty` succession decisions: worker target may be too high for
  current backlog.
- Many warm TTL expirations: manager is warming too early or dispatch is
  blocked.
- Many `retirement_blocked` workers: delivery/cleanup/review evidence is
  unhealthy.
- Many `safe_abandonment` retirements: worker prompts or monitoring are failing.
- Few retirements and high warm count: possible worker overgrowth.

Manager reactions:

- reduce worker target;
- run refill planning;
- refresh sprint status;
- inspect dispatch blockers;
- improve worker handoff/final checkpoint contract;
- report backlog exhaustion instead of warming more workers.

Cycle packet should include a compact `retirementBacklogSignal` summary.

## Assignment Epochs

Substitute raw session lifetime with assignment epochs. A worker session may
exist across zero or more epochs, but each assignment has a clean start/end
boundary.

Epoch lifecycle:

- `epoch_started`: manager writes handoff and assignment lease.
- `epoch_active`: worker is doing assigned work.
- `epoch_checkpointed`: worker writes compact progress checkpoint.
- `epoch_finalizing`: worker is preparing final checkpoint, review, delivery, or
  cleanup evidence.
- `epoch_closed`: final checkpoint accepted; no active work remains for this
  epoch.
- `epoch_reused`: manager starts a new epoch after context hygiene gate.
- `epoch_retired`: no new epoch; worker proceeds to retirement.

Epoch fields:

- `epochId`
- `workerId`
- `assignmentId`
- `handoffRef`
- `startedAt`
- `closedAt`
- `finalCheckpointRef`
- `handoffQuality`
- `contextHygieneResult`
- `nextEpochAllowed`

Policy:

- Reuse means starting a new epoch, not continuing the previous one.
- A worker with an open epoch is not retirable unless emergency/resource policy
  allows safe abandonment.
- A worker with multiple epochs needs stricter context hygiene.
- Set a max epoch count per worker before forced retirement.
- Dashboard can show `epochAge` and `epochCount` instead of only session age.

## Retirement Reasons

Use stable reason codes:

- `delivered_no_queue`
- `warm_ttl_expired`
- `resource_conserve`
- `manager_drain`
- `assignment_closed`
- `workspace_cleaned`
- `stale_completed_session`
- `duplicate_worker`
- `policy_blocked_question`
- `recovery_submit_unanswered`
- `critical_resource_pressure`
- `manager_shutdown`
- `context_hygiene_failed`
- `authority_contamination`
- `domain_shift`
- `unreachable_worker`
- `leaked_worker_session`
- `worker_lifecycle_leak`
- `clean_retirement`
- `safe_abandonment_no_roots`
- `safe_abandonment_stale_idle`
- `safe_abandonment_session_absent`

## Retirement Blockers

Use stable blocker codes:

- `assignment_active`
- `dirty_worktree`
- `pr_checks_pending`
- `pr_checks_failing`
- `review_threads_unresolved`
- `cleanup_not_done`
- `worker_owned_by_other_manager`
- `no_final_checkpoint`
- `unknown_prompt_state`
- `material_question_open`
- `handoff_pending`
- `identity_ambiguous`
- `context_hygiene_unverified`
- `authority_surface_changed`
- `domain_compatibility_unknown`
- `reachability_unknown`
- `reachable_root_present`
- `blocked_state_mismatch`
- `cross_lane_dependency_unexternalized`
- `partial_requires_emergency`
- `verification_inconclusive`
- `sandbox_boundary_inconclusive`

## Brainstorming Synthesis

The expanded retirement model should be implemented as a small lifecycle state
machine plus evidence contracts, not as a growing list of edge-case fixes.
Every live worker needs a current reason to exist. Every retirable worker needs
a complete handoff. Every physical close needs a prior logical state transition
and recovery breadcrumb.

Primary themes from the BMAD brainstorming pass:

1. **Lifecycle state and eligibility.** Replace indefinite idle sessions with
   explicit states: `active`, `warm_available`, `retirable`,
   `retirement_blocked`, `abandoned`, and `retired`.
2. **Context hygiene and reuse control.** Warm reuse should be a positively
   proven exception. Retire by default when domain, authority, source state,
   unresolved questions, or context cleanliness are uncertain.
3. **Safety gates and evidence.** Final checkpoints, review-thread state, PR
   cleanup, worktree status, open blockers, and recovery pointers are the
   retirement boundary.
4. **Manager attention and capacity.** Completed workers should not keep
   consuming normal poll-loop attention. Lifecycle counts should distinguish
   useful capacity from stale retirement debt.
5. **Ecosystem and succession.** Worker death is not lane death. Lane state,
   dependency state, and backlog state must outlive the tmux session.
6. **Stability and recovery.** Retirement decisions need idempotency,
   cooldowns, dry-run evidence, safe abandonment, and rare explicit revival
   gates.

Priority order:

1. Add read-only lifecycle projection and worker counts.
2. Add final checkpoint completeness validation.
3. Add dry-run retirement selection for completed and warm-expired workers.
4. Add context hygiene gate for warm reuse.
5. Add worker leak detector output.
6. Add logical retirement ledger state before process closure.
7. Add bounded apply retirement for dry-run-proven manager-owned workers.
8. Integrate retirement decisions into continuous manager mode before warming
   or dispatch expansion.

Breakthrough design shifts:

- **Reverse the burden of proof.** A worker remains alive only when the manager
  can identify an active assignment, warm lease, blocker, operator hold, or
  keystone role.
- **Use assignment epochs.** A worker session can continue only by opening a
  new clean epoch with fresh handoff, authority, evidence, and context boundary.
- **Separate clean retirement from safe abandonment.** Unsafe close should be
  reported as an abandoned/blocked state with recovery evidence instead of
  hidden behind generic failure.
- **Block on inconclusive verification.** Sandbox-boundary, timeout, or
  incomplete-output verification must be treated as a retirement blocker until
  classified and resolved through the sandbox-boundary workflow.
- **Use retirement as telemetry.** High retirement blockage, queue exhaustion,
  and over-warming are feedback about manager quality and backlog health.

Immediate action plans:

1. **Lifecycle projection**
   - Add a pure classifier from worker records, lane state, queue state, PR
     state, cleanup state, and manager ownership to lifecycle states.
   - Add cycle packet counts for active, warm, retirable,
     retirement-blocked, abandoned, and retired workers.
   - Verify with fixtures for active, delivered, warm-expired, blocked, and
     unknown ownership cases.

2. **Final checkpoint contract**
   - Define required checkpoint fields for assignment id, branch, diff summary,
     verification, PR state, review-thread state, cleanup state, open blockers,
     and recovery pointer.
   - Validate checkpoint completeness before `retirable`.
   - Surface missing fields as specific retirement blockers.

3. **Dry-run retirement selection**
   - Extend retirement summary JSON with completed and warm-expired candidates.
   - Include reason, blockers, ownership proof, evidence pointer, and exact
     apply command.
   - Add negative tests for dirty worktree, pending checks, unresolved review
     threads, missing checkpoint, and non-manager-owned sessions.

4. **Bounded apply retirement**
   - Require a matching recent dry-run packet before apply.
   - Mark logical retirement in metadata and append a metadata-only ledger
     event.
   - Close only the selected manager-owned tmux session.
   - Leave a resume breadcrumb and recovery path.

## Proposed Implementation Slices

### Slice 1: Read-Only Lifecycle Projection

Smallest useful outcome:
- Extend worker status/progress packets to project lifecycle states:
  `active`, `delivered`, `cleanup_complete`, `warm_available`,
  `retirable`, `retirement_blocked`, `retired_logical`,
  `retiring_physical`, `retired`, and `abandoned`.

Expected changes:
- Add classification helpers in the manager-control-plane library.
- Add counts to cycle packet:
  - `active`
  - `warm`
  - `retirable`
  - `retirement_blocked`
  - `retired_logical`
  - `retiring_physical`
  - `retired`
  - `abandoned`
- No tmux mutation.

Verification:
- `pnpm run test:manager-control-plane`
- `pnpm run test:manager-worker-clean-cycle-observer`
- focused fixture tests for delivered/no-queue and blocked/dirty states.

### Slice 2: Final Checkpoint Contract

Smallest useful outcome:
- Define and validate a compact final worker checkpoint schema.
- Workers can request `retired_clean_requested`, `warm_available`, or
  `retirement_blocked`.

Expected changes:
- Add validator for final checkpoint required fields.
- Teach progress/lane-advance packets to surface final checkpoint state.
- Do not close sessions yet.

Verification:
- Fixture tests for valid final checkpoint, missing PR state, missing cleanup
  state, open question, and dirty worktree blocker.

### Slice 3: Retire Eligible Completed Workers Dry-Run

Smallest useful outcome:
- Extend `manager-worker-retire.mjs --summary-json` to include a dry-run mode
  for `delivered_no_queue`, `warm_ttl_expired`, and `manager_drain` candidates,
  not only recovery-submit-unanswered and policy-blocked questions.

Expected changes:
- Candidate selector uses compact metadata only.
- Dry-run packet lists selected workers, reason, assignment, blocker status, and
  exact apply command.
- Unknown/non-manager-owned sessions remain blocked.

Verification:
- Tests prove eligible completed worker appears.
- Tests prove dirty worktree, pending PR checks, unresolved review thread, and
  non-manager-owned worker do not appear as apply candidates.

### Slice 4: Apply Retirement For Completed Workers

Smallest useful outcome:
- Apply gate retires only dry-run-proven manager-owned completed/warm-expired
  workers.

Expected changes:
- Update worker record to `retired`.
- Kill only selected manager-owned tmux sessions.
- Append metadata-only ledger event `worker_retire_apply`.
- Preserve recovery path: warm a replacement only through existing gates.

Verification:
- Apply fixture for `delivered_no_queue`.
- Apply fixture for `warm_ttl_expired`.
- Negative tests for unknown session and active assignment.

### Slice 5: Manager Continuous Mode Integration

Smallest useful outcome:
- Continuous loop chooses retirement before warming more workers when completed
  or expired warm sessions exist.

Ordering preference:
1. answer material questions;
2. advance completed lanes to review/delivery gates;
3. retire delivered/no-queue or warm-expired workers;
4. warm/reuse only if queue pressure justifies it;
5. dispatch new work through existing gates.

Verification:
- Run-contract tests prove continuous mode selects retire action before warm
  expansion when retirable workers exist.

### Slice 6: Operator Visibility

Smallest useful outcome:
- Cycle packet and dashboard-facing summaries show worker lifecycle clearly.

Suggested fields:
- `workerCounts.active`
- `workerCounts.warm`
- `workerCounts.retirable`
- `workerCounts.retirementBlocked`
- `workerCounts.retired`
- reason/blocker samples with worker id and assignment id.

Verification:
- Contract test for compact heartbeat/cycle output.
- No raw tmux/provider payloads retained.

## Manager Shutdown Mode

Future steering command:

```text
stop after current lanes
```

Expected behavior:

- stop new dispatch;
- let active delivery reach safe checkpoint when possible;
- retire warm and completed workers only when no live root remains and dry-run
  proof is complete;
- hold and report workers with question, review, delivery, cleanup, handoff, or
  recovery roots;
- report remaining active/blocked workers;
- write resume packet;
- do not kill unknown sessions.

## Metrics To Track

Add metadata-only counters over time:

- average worker lifetime;
- workers retired cleanly;
- stale completed workers found;
- retirement blocked by reason;
- warm reuse count;
- warm reuse success/failure;
- worker sessions older than max age;
- manager pings avoided because worker was already completed.

## Non-Goals

- Do not terminate unknown or non-manager-owned sessions.
- Do not add broad process-kill behavior.
- Do not retain raw tmux scrollback or provider output.
- Do not let workers claim arbitrary next work.
- Do not treat PR-open as delivery complete.
- Do not bypass existing PR, review-thread, merge, cleanup, or ownership gates.

## Open Design Questions

Answer during implementation planning:

1. What is the default warm TTL: minutes, cycles, or both?
2. Should `retired_clean_requested` be worker-written, manager-written, or both?
3. What exact evidence proves cleanup complete for no-PR experimental lanes?
4. What future explicit source-owned policy, if any, should allow worker
   self-close after the initial manager-owned closure slices?
5. Should warm reuse require same story/epic/domain, or just any safe backlog
   lane?

Recommended defaults:

- Use both TTL minutes and cycle count.
- Worker writes `retired_clean_requested`; manager performs actual tmux retire
  when operating in managed continuous mode.
- Same epic/domain is preferred for reuse; otherwise retire.
- Worker self-close is out of scope for the initial slices. Any future self-close
  path must be explicitly designed and remain subordinate to the manager
  retirement ledger.

## Done Criteria

- Completed workers do not persist indefinitely.
- Warm workers expire deterministically.
- Manager can report why every worker is active, warm, retirable, retired, or
  blocked from retirement.
- Retire apply is dry-run-proven and manager-owned only.
- No worker is retired while active delivery, review, PR checks, cleanup, or
  material questions remain unresolved.
- No worker is retired when verification is inconclusive because of sandbox
  boundaries, runner timeouts, child-process crashes, or incomplete command
  output.
- Future sessions can continue from this artifact without reconstructing the
  policy from chat.
