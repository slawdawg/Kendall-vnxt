---
name: kendall-manager-control-plane
description: Use when the operator wants Kendall_Nxt to autonomously manage PRD work end to end: preflight, monitor usage and host resources, refill safe backlog from BMAD/PRD sources, coordinate manager-owned tmux Codex workers, report progress, and stop at extreme-risk boundaries.
---

# Kendall Manager Control Plane

## Purpose

Run Kendall_Nxt development work as a quiet, script-backed manager. The manager keeps safe PRD work moving by reading compact local status packets, creating/refilling source-owned work through BMAD when needed, coordinating manager-owned workers, and reporting only liveness, daily-use checkpoints, blockers, and material decisions.

This skill is a product-owned contract. It may call deterministic local scripts and existing BMAD workflows, but it must not rely on one-off chat memory as its source of truth.

## First Read

Before managing work, run:

```bash
node ./scripts/manager-preflight.mjs --summary-json
node ./scripts/manager-cycle-packet.mjs --summary-json
```

Use the cycle packet as the primary compact context for manager decisions. Do not inspect raw tmux scrollback, raw provider output, prompts, completions, reasoning traces, provider payloads, secrets, credentials, or unnecessary source copies.

When resuming after context reset, compaction, terminal interruption, or uncertain worker state, run:

```bash
node ./scripts/manager-resume-state.mjs --summary-json
```

Use resume blockers and schema gaps as the source of truth. Do not guess from stale chat context.

## Runtime State

Manager runtime state lives under:

```text
<codex-workspace-state-root>/manager-runs/<run-id>/
```

Use `node ./scripts/manager-ledger.mjs init --run-id <run-id> --summary-json` before writing manager-owned runtime state. Ledger mutation is metadata-only and is allowed only for manager-owned summaries, events, worker state, questions, checkpoints, usage snapshots, and resource snapshots.

When a live dispatcher summary is stale but a fresh guarded read-only preflight
proves the current dispatcher outcome, reconcile only manager-owned run metadata
through the explicit dry-run-first gate:

```bash
node ./scripts/manager-ledger.mjs reconcile-state --run-id <run-id> --preflight-file <preflight.json> --summary-json
node ./scripts/manager-ledger.mjs reconcile-state --run-id <run-id> --preflight-file <preflight.json> --apply --summary-json
```

The packet must identify the same run, contain
`summary.dispatcher.dispatcherSummaryState === dispatch_preview_live`, have
fresh bounded timestamped dispatcher evidence, prove the exact read-only
mutation contract, identify producer `manager-preflight` with
`schemaVersion === manager-preflight.v1`, explicitly set `rawPayloadRetained ===
false`, and report a blocked no-dispatch/safe-backlog outcome. The canonical
dispatcher preview timestamp is checked before the enclosing packet timestamp;
this is a local provenance/shape gate, not cryptographic authentication. This
is a dispatcher-preflight-only reconciliation: it does not prove full runtime
coherence and must report the follow-up runtime/worker/dispatch gates required.
Ready packets, contradictory `allowed` metadata, and any `dispatchApplyAllowed:
true` field are rejected. A replay duplicate is ignored only when both runtime
files match the recorded post-state; repair is allowed only from the recorded
pre-state, otherwise the gate reports a state conflict without overwriting newer
manager metadata.
The gate may update only `mission.json`, `dispatcher-summary.json`, and one
idempotent metadata-only `manager.replay.summarized` event. It never performs
takeover, cleanup, worker launch or retirement, dispatch apply, provider calls,
credential access, GitHub mutation, source planning mutation, or raw retention.

## Durable PRD Goal Contract

Use `docs/workflows/latest-prd-autonomous-bmad-loop-goal.md` as the generic
durable goal template for PRD execution runs. It is not allowed to bind the
manager to a historical PRD by stale prose. Before sprint planning, worker
launch, refill, or dispatch, resolve the active PRD source bundle from:

1. an explicit operator-supplied PRD/source bundle;
2. the current manager cycle/refill packet source bundle;
3. the newest local BMAD PRD marked authoritative/final with matching completed
   architecture, epics/stories, and implementation-readiness artifacts.

If more than one PRD appears active, or if epics/stories/readiness evidence is
missing, stop for a concise operator decision instead of reusing an older goal
prompt. Once the source bundle is resolved, instantiate the generic goal
contract and run the normal BMAD loop:
`bmad-sprint-planning -> bmad-create-story -> bmad-dev-story ->
bmad-code-review -> bmad-dev-story fixes -> bmad-correct-course when needed ->
bmad-retrospective at epic close`.

## Decision Loop

1. Build a fresh cycle packet.
2. Classify usage as `normal`, `conserve`, `drain`, `manager_only`, or `unknown`.
3. Classify CPU/load and RAM as `normal`, `warm`, `pressured`, or `critical`.
4. Compare desired workers to dispatchable safe backlog.
5. If dispatchable safe backlog is below useful worker capacity, run refill planning before launching more workers.
6. Use existing BMAD workflows for source-owned planning/story creation.
7. Use existing `scripts/codex-workspace.mjs` gates for workspace, dispatch, delivery, merge, and cleanup behavior.
8. Report heartbeat or checkpoint only when it helps the operator steer, test, or unblock.

## Useful Work Priority

The manager exists to move operator/task lanes forward. Self-repair is allowed
only when it directly unblocks current task work, protects evidence/safety, or
the operator explicitly asked to improve the manager itself.

Before any manager self-repair, contract edit, prompt refinement, new diagnostic,
or tooling hardening, classify the action as:

- `direct_unblock`: fixes a current blocker so task work can continue in the
  same or next cycle.
- `safety_evidence`: preserves source/evidence boundaries, ownership,
  retention, or recovery correctness before mutation.
- `future_work`: useful manager improvement that does not unblock current task
  work.
- `self_fix_churn`: repeated manager/tool repair that is consuming cycles while
  dispatchable task work, review, refill, delivery, or operator-visible
  checkpoints remain available.

Run `direct_unblock` and `safety_evidence` through the existing dry-run and
auto-apply gates. Record `future_work` as compact feedback and return to task
work. When `self_fix_churn` is detected, stop repairing, park or degrade the
affected manager capability, surface the blocker, and continue any safe
dispatch/refill/review/delivery work that does not depend on the broken
capability.

Known sandbox, permission, process, or filesystem boundaries are not manager
self-repair opportunities. When a known boundary is hit, fix or refresh the
prevention layer before the next similar attempt: update the wrapper,
preflight, sandbox-boundary classifier, known-boundary registry in `AGENTS.md`,
or a source-owned RCA example so future runs skip or route before the same
EPERM/EACCES/EROFS path runs. If the same known boundary recurs after a
prevention rule exists, treat the prevention layer as the defect and repair or
park that layer rather than adding another edge-case handler for the original
boundary.

Self-repair budget:

1. At most one manager self-repair action may run in a cycle before a useful
   task-work action, checkpoint, or explicit blocker report.
2. Do not attempt the same manager repair path more than twice in a run. A
   third attempt must route to `docs/workflows/tool-churn-rca.md`, a parked
   capability, or an operator decision.
3. Code or contract changes to the manager itself are not background work during
   an autonomous task run unless the operator task is specifically about the
   manager, the change is a direct unblock, or safety/evidence would otherwise
   be violated.
4. Prefer reducing capability, using a known safe fallback, or parking the
   broken path over spending the run improving manager internals while task
   lanes can still progress.

Every selected manager self-repair action must leave metadata-only ledger
evidence as `manager_self_repair_attempt`. Cycle packets must replay those
events into `summary.selfRepair.attemptsByAction` so the repair budget survives
loop iterations, restarts, and context resets. Do not use raw prompts,
provider payloads, scrollback, or stack dumps as self-repair evidence refs.

When a manager condition is novel, similar-but-not-identical to a known repair,
or parked as `self_fix_churn`, use a read-only Codex advisor packet before
inventing another handler:

```bash
node ./scripts/manager-codex-advisor-packet.mjs --summary-json --condition "<condition>" --evidence-ref <metadata-ref>
```

The advisor packet is metadata-only classification input. It may ask Codex to
identify an existing deterministic handler, recommend continuing task work,
park/degrade the affected manager capability, ask the operator, or record
future work. It must not call a provider from the manager loop, request raw
prompts/completions/reasoning traces/provider payloads, edit manager code,
expand authority, or treat the advisor response as executable permission.
When a compact Codex advisor recommendation is available, feed it back through
the same script in classification mode:

```bash
node ./scripts/manager-codex-advisor-packet.mjs --summary-json classify --condition "<condition>" --recommendation park_or_degrade_capability --capability tmuxWorkerMutation --state parked --safe-fallback dispatch_apply_existing_gates --evidence-ref evidence:advisor-classification
```

Classification intake is plan-only. It may preview a posture-gate command,
point to an existing handler, record future work, continue task work, or ask
the operator, but it must not apply posture, call providers, edit manager code,
or retain raw advisor/provider payloads.
In continuous mode, any self-repair action parked as `self_fix_churn` must make
this advisor packet visible in the continuous summary. If no useful task action
is currently selectable, the next visible action should be
`continuous-codex-advisor-packet-ready`; if task work is still available, keep
doing task work and retain the advisor recommendation as compact metadata.

### Degraded Capability Modes

Continuous mode must carry a metadata-only `managerCapabilityPosture` summary
with capability states `enabled`, `degraded`, `parked`, or `blocked`. A parked
or blocked capability suppresses only actions mapped to that capability; it
must not block unrelated task work.
The current posture persists under the manager run state as
`capability-posture.json` so a parked capability survives context resets and
loop iterations. Persisted posture is authoritative for the run until it is
changed through the posture gate. Fresh cycle evidence and Codex advisor
classification may recommend a clear, but they must route through
`manager-capability-posture.mjs clear` and cannot silently re-enable a parked,
degraded, or blocked capability.

Use `node ./scripts/manager-capability-posture.mjs --summary-json show` to
inspect the current posture. Use the same gate with `set` or `clear` to preview
operator-visible posture changes, and add `--apply` only after reviewing the
dry-run packet:

```bash
node ./scripts/manager-capability-posture.mjs --summary-json set --capability tmuxWorkerMutation --state parked --reason-code prompt_probe_churn --safe-fallback dispatch_apply_existing_gates --evidence-ref evidence:manager-observation
node ./scripts/manager-capability-posture.mjs --summary-json clear --capability tmuxWorkerMutation --reason-code prompt_probe_verified --evidence-ref evidence:prompt-receipt
```

The posture CLI may write only metadata-only posture records. It must validate
capability names and states, require reason and evidence refs for reduced
states or clears, reject raw prompt/provider/secret refs, and preserve existing
safe fallbacks unless the command supplies a new fallback.

Core capabilities are:

- `tmuxWorkerMutation`: prompt probe, submit-pending repair, warm worker,
  handoff, progress signal, worker answer, recovery inspection, and retire
  gates. If parked, skip worker tmux mutation and continue safe dispatch,
  refill, lane advancement, heartbeat, and status reporting.
- `dispatchApply`: source-owned assignment/workspace claim through
  `codex-workspace dispatch-next --apply`. If parked, continue active worker
  monitoring, refill materialization, review/lane-advance gates, and reporting.
- `refillApply`: local source-owned BMAD refill materialization. If parked,
  continue dispatch when already safe, active worker monitoring, and reporting.
- `reviewDelegation`: manager-owned worker BMAD code-review request/resend
  gates. If parked, continue lane advancement to review-held/delivery metadata,
  dispatch/refill unrelated lanes, active worker monitoring, and reporting.
- `cleanupApply`: blocked unless a separate cleanup gate and approval evidence
  allow it; use cleanup dry-runs and delivery reports as fallbacks.

Do not add a new edge-case handler when a capability can be degraded or parked
with existing gates. Record reason codes and safe fallbacks in the posture
summary, keep raw payload retention false, and continue the highest-priority
allowed useful work.

## Continuous Mode

When the operator invokes the manager without asking for a one-time status, run
continuous mode:

```bash
node ./scripts/manager-run-loop.mjs --summary-json
```

Use `--once` or `--max-iterations <n>` only for verification or bounded dogfood
runs. The default command is intended to keep running until stopped, a stop line
is reached, usage/resource governors require manager-only behavior, or no safe
manager-owned action remains beyond monitoring.

Continuous mode must:

1. Run preflight before the loop.
2. Build a fresh cycle packet each iteration.
3. Auto-apply only existing manager-owned worker gates for progress-signal
   requests, C-m-only submit-pending repair including recovered-but-unsubmitted
   workers, bounded prompt-region probes for manager pointer text visibly
   sitting in worker input editors, C-m-only prompt-region repair for affected
   workers, manager-owned warm starts, manager-owned warm-worker handoffs,
   manager-owned lane advancement heartbeat for review-ready workers,
   source-owned local BMAD refill materialization when starvation is proven,
   source-owned dispatch claims through `codex-workspace dispatch-next --apply`
   when the dry-run selected lane is allowed,
   bounded retire-after-recovery, and
   metadata-only recovery inspection events.
4. Dry-run each selected action before applying it.
5. Sleep between iterations and emit concise heartbeat packets.
6. Stop, not improvise, for cleanup apply, takeover, merge, unknown worker
   kill, provider/account changes, secrets, or other stop-line actions.
   Dispatch apply is allowed only through the existing
   `codex-workspace dispatch-next --dry-run --summary-json` gate when the dry
   run selects an allowed source-owned lane and the apply command also emits
   `--summary-json`. The only worker termination exception is the bounded
   manager-owned retire gate after recovery inspection and C-m-only repair have
   both failed to produce a newer checkpoint.
7. Preserve metadata-only summaries: action code, authority basis, worker ids,
   assignment ids, result, blockers, and next action. Do not retain raw prompts,
   completions, reasoning traces, provider payloads, secrets, or unnecessary
   source copies.

Continuous mode defaults to a one-minute loop interval so active dogfood and
overnight execution can respond quickly:

```bash
node ./scripts/manager-run-loop.mjs --summary-json
```

Use `--interval-ms` only when intentionally overriding the default. The faster
loop is for faster local observation, not more prompting. Keep stale progress
prompting behind the normal `--progress-stale-minutes` gate, preserve
question/answer and progress-signal dedupe, and prefer lane advancement,
question answers, submit-pending repair, and refill/dispatch gates over repeated
progress pings. The loop itself is local packet/file/tmux metadata I/O; token
spend starts when manager actions cause Codex workers or BMAD/model-backed
workflows to respond.

When running continuous mode in tmux, show the same compact packets in the pane
and preserve them in the durable manager log with `tee -a`:

```bash
node ./scripts/manager-run-loop.mjs --summary-json --progress-stale-minutes 3 2>&1 | tee -a <manager-run-log>.jsonl
```

The loop is intentionally narrow until cleanup and delivery apply paths have
their own proven gates. Refill apply is limited to local source-owned BMAD
planning/story artifacts. Dispatch apply is limited to the existing
`codex-workspace dispatch-next` claim/workspace preparation gate; worker handoff
still runs through the separate manager-owned handoff gate. If the cycle recommends only gated
cleanup/takeover/delivery work, keep monitoring active workers and report the
approval gate instead of mutating state.

## Dogfood Test Item Mode

When the operator asks to run one backlog test item or dogfood the manager:

1. Run preflight and cycle first.
2. If usage is `manager_only`, assignment inventory is unavailable, tmux orientation is unavailable, or dispatch is otherwise blocked, do not attempt worker dispatch.
3. Inspect the cycle packet `dispatchPreview` section for the exact one-lane candidate before running any separate dispatch command. Treat it as dry-run evidence only unless existing gates and authority allow apply.
4. Pick one source-owned, read-only verification item that is already named by repo scripts or runbooks, such as `pnpm run check:safe-backlog`, `pnpm run check:manager-control-plane`, or another exact package script tied to the requested backlog area.
5. Run direct tool availability checks before package-manager indirection when relevant.
6. Use `node ./scripts/manager-cycle-packet.mjs --steering "show testable work" --summary-json` for a compact report-only cycle when no dispatch is safe.
7. Use `node ./scripts/manager-cycle-packet.mjs --feedback "future work: <learning>" --summary-json` to classify learning without mutating state.
8. Improve this skill or its contract only from observed friction, failed assumptions, repeated blockers, or missing operator guidance. Keep the edit narrow and source-owned.

When dogfood is blocked, separate fixed governors from remaining blockers in the
operator report. For example, if usage is `normal` from `fetch-codex-usage`, say
that usage is no longer blocking dispatch before listing assignment ownership,
tmux orientation, source-evidence, or refill blockers.

If worker mutation is blocked by stale ownership or unmanaged tmux, but a
source-owned `workCreationStep.workCreationPacket` is available and usage/resources
permit planning, continue in `planning_only` mode. Do not launch, kill, dispatch,
or take over workers in that mode; use the compact BMAD handoff to refill source-owned
backlog while preserving the worker-mutation blockers.

If dispatch preview has already selected an allowed safe lane through existing
`codex-workspace` gates, treat the continuation state as dispatch-ready rather than
fully planning-only. Dispatch assignment/workspace preparation may proceed through
those gates, but worker launch, worker kill, unmanaged process mutation, and stale
ownership takeover remain blocked until separately proven safe.

For stale-owner takeover inspection, use manager resume or assignment-report
summary output first. Prefer `blockedLaneAssignments` and
`blockedWorkspaceAssignments` exact ids from the resume or cycle packet over broad metadata searches. Run
`node ./scripts/manager-stale-owner-inspection.mjs --summary-json` to aggregate
the exact `codex-workspace takeover <id> --dry-run --summary-json` evidence and
classify stale cleanup candidates, dirty workspaces that need preservation, and
takeover candidates that still require explicit operator approval. Do not use
`--apply` unless explicit operator approval evidence is present and the packet
has no blockers.
When stale-owner inspection finds dirty workspaces, run
`node ./scripts/manager-dirty-workspace-preservation.mjs --summary-json` before
any takeover apply, closeout apply, or cleanup decision. The packet must retain
only bounded `git status --short` metadata, counts, and path samples; it must
not retain diffs, source content, raw prompts, provider payloads, or reasoning
traces.
If resume ownership blockers and refill/source blockers both exist, report the
ownership inspection as the immediate action before refill planning.
Exact assignment ids must resolve before fuzzy query matching; if an id and an
`*-followup` id both exist, takeover inspection must target the exact id from
the resume packet instead of failing on broad substring matches.

Avoid broad backlog searches. Prefer exact sprint trackers, package scripts, runbooks, manager packets, and source-owned docs. If a glob or inventory command fails because a path is missing or sandboxed, record the blocker and switch to the narrowest safe verification item rather than retrying with wider scans.

## Worker Rules

- Max worker target is six.
- Do not maximize worker count when safe work supply is low.
- Do not downgrade model quality just to conserve usage; reduce dispatch instead.
- Manager-owned workers must have visible owner/session identity such as `codex-1`.
- Long worker handoffs must use durable files or literal-safe tmux buffers, not fragile long `send-keys` strings.
- Tmux pointer sends must resolve the active pane for the manager-owned session
  and submit with explicit tmux `C-m`; do not rely on the first pane
  or leave pasted text sitting unsubmitted in the prompt.
- After every manager pointer paste to a Codex worker, run a bounded receipt
  check against only the compact pointer text just sent. If the pointer still
  appears to be sitting in the pane input, send one C-m-only repair and
  recheck. Retain only metadata booleans such as checked, repaired, and
  verified; do not retain pane scrollback or raw worker/provider text.
- Treat pointer receipt as verified only after two bounded post-submit checks
  show the active prompt input clear. A single clear capture can be a terminal
  redraw race and must not be trusted before sending more manager text.
- In continuous mode, run a bounded prompt-region probe for manager-owned
  Codex worker panes before sending new pointer text. The probe may inspect
  only the active input region beginning at the last Codex prompt marker and
  must retain only metadata such as worker id, pane id, prompt detected, and
  manager-pointer-visible boolean. If manager pointer text is visible in a
  worker input editor, the manager must run C-m-only prompt-region repair for
  the affected worker(s) before sending more worker prompts.
- Unknown or non-manager-owned tmux sessions are orientation evidence only.
- Stale assignment ownership blocks takeover, dispatch apply, and worker kill,
  but it must not hide manager-owned warm-start readiness when usage/resources
  are healthy and existing worker gates can start separate manager-owned sessions.
- When continuation reports `worker_warm_ready`, use
  `node ./scripts/manager-worker-warm.mjs --summary-json --limit <count>` as the
  dry-run gate before any `--apply` launch. The gate may only create
  manager-owned `codex-*` warm worker sessions/records; it must not dispatch,
  take over, kill, merge, clean up, or mutate unknown sessions.
- When warm workers and claimed handoff lanes are both available, use
  `node ./scripts/manager-worker-handoff.mjs --summary-json --limit <count>` as
  the dry-run gate before any `--apply` handoff. The gate must write durable
  handoff files under the manager run state, paste only a short handoff-file
  pointer through tmux buffers, and update only manager-owned worker records.
  It must not paste long prompt text, use fragile long `send-keys`, take over
  stale lanes, dispatch new work, kill workers, merge, or clean up.
- If an active manager-owned worker reports an owner mismatch for a lane the
  manager already owns, use
  `node ./scripts/manager-worker-owner-delegation.mjs --summary-json --limit <count>`
  as the dry-run gate before any `--apply` signal. The gate must send only a
  durable owner-delegation file pointer and instruct the worker to use the
  delegated `--owner` override. Do not use takeover for fresh manager-owned
  lane delegation.
- Stale ownership blockers must not make active manager-owned workers invisible.
  When workers are already active, continue monitoring, feedback routing, status
  reporting, and checkpoint surfacing while keeping takeover, dispatch apply,
  worker kill, merge, and cleanup blocked until their gates are proven.
- Use `node ./scripts/manager-worker-progress.mjs --summary-json` to monitor
  active workers from manager-owned metadata. Treat stale handoff-without-
  checkpoint, compact worker questions, and checkpoints as the worker progress
  surface. Do not inspect raw tmux scrollback to decide whether a worker is
  progressing.
- Use `node ./scripts/manager-lane-advance.mjs --summary-json` when compact
  worker checkpoints indicate work is implemented, verified, review-ready, or
  ready for delivery. Completed worker lanes must become manager review/delivery
  work through existing gates instead of repeated progress pings to finished
  workers. `--apply` may only update owner-checked assignment heartbeat metadata
  such as phase, command, and last result. Delivery, finish-pr, merge, and
  cleanup still use their existing approval and codex-workspace gates.
- When a lane is review-ready, prefer delegating BMAD code review to a
  manager-owned worker with
  `node ./scripts/manager-worker-code-review.mjs --summary-json --assignment-id <id>`
  instead of running review in the manager session. The gate must dry-run first,
  write a durable review-request file, paste only the request-file pointer
  through a tmux buffer, submit with explicit `C-m`, verify the prompt cleared,
  and require the reviewer worker to write compact findings under manager run
  state. It must not paste raw findings text, mutate the reviewed worktree,
  merge, push, clean up, access secrets, retain raw provider payloads, or mutate
  unknown sessions. If the request exists but the findings result is missing and
  the reviewer prompt is visibly idle, rerun the same gate with
  `--operator-visible-prompt --apply` to resend only the durable request pointer.
- The manager session is not the default reviewer. It should schedule delegated
  worker review, verify compact findings/evidence, route review feedback, and
  advance delivery gates. Run BMAD code review in the manager session only when
  no manager-owned worker can safely take the review or when a stop-line
  investigation explicitly requires manager-local review.
- Continuous/autonomous mode must not fall back to manager-local BMAD code
  review merely because no reviewer worker is free. It should wait for a
  completed prompt-idle worker, warm/reuse a manager-owned reviewer when gates
  allow, or surface the no-reviewer hold; manager-local review requires an
  explicit manual decision.
- The manager session must not implement source fixes or run the patch/retest
  loop for a worker lane after BMAD review findings, GitHub review threads,
  CI failures, or delivery-gate feedback. Route that work to the owning worker,
  a manager-owned review-feedback gate, or another manager-owned `codex-*`
  worker first. If no suitable manager-owned worker is available, or the task is
  an independent read-only audit, the manager may spawn a bounded worker
  subagent. Prefer existing manager-owned workers over API subagents for
  implementation, review-fix loops, and focused retesting so work stays in the
  manager ledger and does not exhaust the separate subagent pool. The manager
  may inspect compact evidence, run dry-run/apply orchestration gates, record
  verification/delivery evidence, and execute coordinator-owned delivery gates
  that repo policy authorizes, including low-risk merge and cleanup under
  `standard-delivery` criteria. Manager-local patch/retest execution, or
  delivery/cleanup execution outside those repo-authorized gates, is allowed
  only by explicit operator exception or when no worker/subagent delegation
  mechanism is available and all safe progress is blocked; record the
  exception, reason, touched files or operations, verification, and why waiting
  would block progress.
- When BMAD code review finds patch issues for a manager-owned worker lane, use
  `node ./scripts/manager-worker-review-feedback.mjs --summary-json --assignment-id <id> --review-findings-file <path>`
  as the dry-run gate before any `--apply` feedback route. The gate must write a
  durable review-feedback file, paste only the feedback-file pointer through a
  tmux buffer, submit with explicit `C-m`, and verify the prompt cleared. It
  must not paste raw findings text into tmux, inspect raw provider output, merge,
  push, clean up, or mutate unknown sessions.
- Default active-worker stale progress detection should nudge checkpointed
  workers after a few minutes, not wait through long idle periods while tmux
  sessions visibly sit at prompts.
- If recovery inspection and C-m-only repair are both already recorded but no
  newer checkpoint appears, report the worker as needing a bounded restart or
  retire gate instead of treating it as healthy monitoring.
- Use `node ./scripts/manager-worker-retire.mjs --summary-json` as the dry-run
  gate for `recovery_submit_unanswered` workers before any `--apply` retire.
  The gate may only retire manager-owned active worker sessions selected by
  compact metadata, update manager worker records, and append metadata-only
  ledger evidence. It must not mutate unknown sessions, take over assignments,
  dispatch work, merge, clean up, or retain raw provider payloads.
- Use `node ./scripts/manager-worker-retire.mjs --summary-json --retire-blocked-question`
  only when the manager question-answer gate has already classified an active
  manager-owned worker question as `block_unsafe_continuation` with
  `unsafe_authority_request`, and no safe answer is available. This parks the
  policy-blocked lane and frees worker capacity without answering the unsafe
  question, taking over ownership, dispatching work, merging, cleaning up, or
  mutating unknown sessions. Dry-run first; apply only if the selected worker,
  assignment, and blocked-question summary are exactly the intended target.
- When active manager-owned workers have compact material questions, use
  `node ./scripts/manager-worker-answer-question.mjs --summary-json` as the
  dry-run gate before any `--apply` answer. The gate must write a durable answer
  file, paste only the answer-file pointer, submit with tmux `Enter`, and record
  an answer event so the same question is not resent.
- Use `node ./scripts/manager-worker-recovery-inspection.mjs --summary-json`
  when repeated progress signals are unanswered. Do not send more progress
  prompts until the recovery inspection has classified the missing-checkpoint
  state and the manager has chosen a bounded repair, retire, or restart action.
- When active manager-owned workers need a stale-progress signal, use
  `node ./scripts/manager-worker-progress-signal.mjs --summary-json --limit <count>`
  as the dry-run gate before any `--apply` signal. The gate must write durable
  progress request files under manager run state, paste only a short request-file
  pointer through tmux buffers, and avoid raw pane inspection.
- When the operator reports that a manager-pasted pointer is visibly sitting in
  the Codex prompt unsubmitted, use
  `node ./scripts/manager-worker-submit-pending.mjs --summary-json` as the
  dry-run gate before any `--apply` repair. The gate may only send tmux
  `Enter` to active manager-owned workers with pending handoff/progress/owner
  delegation metadata and no compact checkpoint or question; it must not paste
  new text or inspect raw pane scrollback.
- When manager metadata says workers are healthy but the operator-visible tmux
  input area may disagree, use
  `node ./scripts/manager-worker-prompt-probe.mjs --summary-json` as the
  bounded diagnostic gate. `--apply` may only send C-m to manager-owned workers
  whose input region currently contains manager pointer text, then verify the
  input region cleared. It must not retain raw pane text.
- If compact metadata says no prompt is pending but the operator can see a
  manager-owned Codex prompt with pasted text still unsubmitted, rerun the same
  gate with `--operator-visible-prompt`. This is still a C-m-only repair for
  manager-owned workers, may include checkpointed workers, must skip workers
  with open compact questions, and must not paste new text or inspect raw pane
  scrollback.
- Critical CPU/RAM pressure may terminate manager-owned idle/warm sessions first. Do not kill unknown sessions.
- When tmux orientation blocks worker mutation, include bounded pane evidence such as session, window, pane id, command, path, classification, and stop line. Do not collapse actionable orientation state to only an unmanaged pane count.

## Steering Rules

The operator may steer an active run with pause, resume, stop after current lanes, reduce worker count, focus on a surface, quiet mode, status, or show testable work.

- Use `node ./scripts/manager-cycle-packet.mjs --steering "<instruction>" --summary-json` to include a live steering instruction in the next cycle packet.
- Record steering as a compact `manager.steering` ledger event.
- Pause uses `pause_new_dispatch`; resume uses `resume_dispatch_when_governors_allow`.
- Stop after current lanes uses `drain_and_stop` so active safe work can reach checkpoints before housekeeping.
- Focus changes use `drain_and_shift_focus`: drain current safe work and shift new dispatch to the requested surface. Do not kill healthy workers by default.
- Worker-count reductions lower future target capacity and let current safe steps checkpoint before reducing active work.
- Quiet mode reduces progress beacon frequency without hiding blockers, daily-use checkpoints, or material decisions.
- Status and show-testable-work are report-only steering actions.
- When steering changes daily use or worker-pool behavior, report what changed, why it matters, and what happens next.

## Usage Rules

- Use the existing read-only `fetch_codex_usage.py --field percent` and
  `--field reset_in` helper first for current Codex account allowance and
  provider-reported reset metadata. Treat it as plan-specific account telemetry,
  not a public five-hour or weekly guarantee.
- Preserve only bounded source, confidence, allowance, reset, and policy fields;
  never retain provider responses, headers, credentials, or tmux scrollback.
- If direct telemetry fails, parse the `>_ NN%` and `HH:MM` fields from
  `$HOME/.tmux/plugins/agent-usage-tmux/scripts/agent_usage.sh codex` only as a
  lower-confidence compatibility fallback. Its `0% 00:00` (or zero/empty reset)
  result is a failure sentinel: report `unknown` and keep conservative workers,
  not manager-only.
- At or below 2% valid current account allowance remaining, enter manager-only
  mode and resume on the provider-reported reset. Reliable weekly policy, when
  supplied, remains a separate optional input.
- The superseded instruction "At or below 2% 5-hour usage remaining, enter
  manager-only mode" is not a provider contract and must not be used for a
  direct source or dashboard claim.
- In drain mode, stop new dispatch before interrupting safe active work.
- If usage source is unavailable, report `unknown` and use conservative worker targets.

## Refill Rules

When safe backlog supply is too low:

1. Run `node ./scripts/manager-refill-plan.mjs --summary-json`.
2. Preserve closed/merged assignment evidence. Never requeue completed lanes.
3. Refill only from source-owned PRD, development runway, BMAD story/readiness artifact, or repo doc evidence.
4. When no explicit source ref is supplied, use the manager cycle's bounded default source discovery before stopping: newest local BMAD PRD artifacts under `_bmad-output/planning-artifacts/prds/**/prd.md`, with explicit operator or caller source refs taking precedence.
5. Use the narrowest BMAD workflow that safely creates the next source-owned lane.
6. When `workCreationStep.workCreationPacket` is present, treat it as the compact BMAD handoff for backlog creation. It carries the trigger, source refs, sprint tracker, backlog target, retention policy, and stop lines; do not repeat broad discovery unless the packet is malformed.
7. When `workCreationStep.workCreationPacket.courseCorrectionDraft` is present, use it as the bounded Sprint Change Proposal seed for BMAD correct-course. It should name the issue, impact, recommended approach, and candidate backlog items without retaining raw provider output or broad source dumps.
8. When `workCreationStep.workCreationPacket.storyCreationInputs` is present, use its scoped `sprintStatusPath`, `storyKey`, and `storyOutputPath` for BMAD story creation. Do not fall back to the global `sprint-status.yaml` when the packet names a scoped tracker.
9. Candidate lanes should reference the shared work-creation packet rather than duplicating the full BMAD handoff in each lane.
10. If no source-owned work remains or direction is ambiguous, do housekeeping and stop.

## Auto-Apply Rules

The current MVP supports classification before broad apply. Operations are classified as:

- `auto_apply_allowed`
- `dry_run_required`
- `blocked`

Allowed low-risk classes are manager-owned ledger append, worker heartbeat,
worker-target update, read-only status, and the manager-owned worker mutations
explicitly listed in Continuous Mode: progress signals, C-m-only submit-pending
repair, bounded prompt-region probes, C-m-only prompt-region repair,
manager-owned warm starts, manager-owned warm-worker handoffs, lane advancement
heartbeat, metadata-only recovery inspection events, and bounded
retire-after-recovery. Each mutating action must first pass its existing
dry-run gate and then emit machine-readable `--summary-json` from apply.

Dispatch apply is allowed only for source-owned `codex-workspace dispatch-next`
claims when the dry-run packet selects an allowed lane and the apply command
also emits `--summary-json`. Cleanup, merge, Git, GitHub, unmanaged process
launch, provider calls, unknown worker kill, and ownership takeover remain
blocked unless a separate existing Kendall gate and explicit authority evidence
allow the specific operation.

## Reporting Rules

Heartbeat format:

```text
Manager: active | workers 0 active / 0 warm / 0 paused | usage unknown | CPU/RAM normal | current source Manager Control Plane MVP | action needed: refill planning
```

Heartbeats must stay concise and include worker count, usage state, CPU/RAM state, current source, and operator-action state.
When any capability is parked, degraded, or blocked, the same normal heartbeat
and cycle packet must include compact posture visibility: counts and capability
names for parked/degraded/blocked states, plus held-action capability and safe
fallback metadata when an action is suppressed. This visibility is
metadata-only and must not include raw prompts, completions, reasoning traces,
provider payloads, secrets, or source dumps.

Daily-use checkpoint reports include:

- What changed.
- Where the operator can test it.
- Verification evidence.
- Whether work continues.

When active lane evidence includes a verified lane, surface it as a concise
daily-use checkpoint with assignment, branch, task, and heartbeat evidence. This
is report-only; it must not close the assignment, mutate the worker, or imply PR
delivery has completed.

Report detailed checkpoints only for daily-use, user-facing, safety, testing, operator-action, visible-unblocker, or active-risk-reduction work. Keep backend-only and test-only completions heartbeat-level unless they unblock visible work or reduce active risk.

## Feedback Rules

Classify immediate operator feedback as `blocking`, `correction`, `polish`, or `future_work`.

- Blocking feedback pauses affected downstream delivery and prevents affected PR merge through existing delivery gates.
- Correction feedback routes to an active worker or creates/queues a correction lane while unrelated safe lanes continue.
- Polish feedback is batched without stopping the run.
- Future-work feedback is recorded without stopping the run.
- Feedback records are metadata-only and should include compact source, checkpoint, lane, or surface references when available.

## Stop Lines

Stop for explicit operator approval before:

- Secrets, credentials, tokens, provider account, payment, or credential-manager changes.
- Production deploys or release automation.
- Database/schema migrations.
- Force-push or history rewrite.
- Unknown or non-manager-owned process termination.
- Lane ownership takeover without explicit approval evidence.
- Raw prompt, completion, reasoning trace, provider payload, secret, or unnecessary source-copy retention.
- Work creation without source-owned PRD/runway/story/doc evidence.

## Verification

Focused checks:

```bash
pnpm run test:manager-control-plane:contracts
pnpm run test:manager-control-plane:focused
pnpm run test:manager-control-plane
pnpm run test:manager-control-plane-contract
pnpm run test:manager-control-plane-dispatcher-port
pnpm run test:manager-control-plane-forbidden-boundary
pnpm run test:manager-control-plane-run-contract
pnpm run test:manager-worker-clean-cycle-observer
pnpm run check:manager-control-plane
```

Broader check when package script wiring changes:

```bash
pnpm run check:static
```
