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

## Decision Loop

1. Build a fresh cycle packet.
2. Classify usage as `normal`, `conserve`, `drain`, `manager_only`, or `unknown`.
3. Classify CPU/load and RAM as `normal`, `warm`, `pressured`, or `critical`.
4. Compare desired workers to dispatchable safe backlog.
5. If dispatchable safe backlog is below useful worker capacity, run refill planning before launching more workers.
6. Use existing BMAD workflows for source-owned planning/story creation.
7. Use existing `scripts/codex-workspace.mjs` gates for workspace, dispatch, delivery, merge, and cleanup behavior.
8. Report heartbeat or checkpoint only when it helps the operator steer, test, or unblock.

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

- Use the live `agent-usage-tmux` status-bar script for current Codex 5-hour usage:
  `$HOME/.tmux/plugins/agent-usage-tmux/scripts/agent_usage.sh codex`.
- Parse the `>_ NN%` and `HH:MM` fields from that script output. This script
  output is manager dispatch evidence; raw tmux pane scrollback is not.
- Use `fetch_codex_usage.py --field percent` and `--field reset_in` only as a
  fallback when the live status-bar script is unavailable or unparsable.
- At or below 2% 5-hour usage remaining, enter manager-only mode.
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
