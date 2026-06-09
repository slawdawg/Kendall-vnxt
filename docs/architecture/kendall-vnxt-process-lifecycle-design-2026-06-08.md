# Kendall_vNxt Process Lifecycle Design

Date: 2026-06-08
Status: planning baseline
Scope: Future direct subscription-agent process launch design

## Purpose

This design defines what must exist before Kendall_vNxt can launch a subscription-agent process directly.

It does not approve process launch. It names the lifecycle, evidence, cancellation, workspace, output, session, and rollback controls that a later PRD must implement before crossing the current stop line.

## Lifecycle States

Future process execution must attach to an `ExecutionAttempt`, not a `QueueLease`.

Required lifecycle:

1. `planned`: route, worker, lane, authority mode, and workspace plan are recorded.
2. `approved`: operator approval is bound to the exact route decision, worker, lane, and authority mode.
3. `starting`: process supervisor is preparing an isolated job workspace.
4. `running`: process id or supervisor id is recorded as evidence, with heartbeat.
5. `cancel_requested`: operator or timeout cancellation has been requested.
6. `cancelled`: process tree is stopped and cleanup evidence is recorded.
7. `timed_out`: timeout policy stopped the process and recorded evidence.
8. `failed`: process failed with bounded output evidence.
9. `completed`: process exited successfully and output artifacts are recorded.

The existing attempt lifecycle vocabulary already covers these states. A future process-launch implementation should add process evidence to attempts rather than adding new authority to leases.

## Process Supervisor Requirements

A future direct launch implementation needs:

- process supervisor id separate from OS process id when possible,
- child process tree tracking,
- startup timeout,
- run timeout,
- cancellation timeout,
- heartbeat updates,
- explicit terminal-state reconciliation,
- orphan detection,
- idempotent cleanup.

## Workspace Requirements

Each launched process needs a per-attempt workspace materialization:

- source snapshot strategy,
- read roots,
- write roots,
- artifact root,
- forbidden paths,
- diff capture,
- cleanup rule,
- rollback rule.

Source mutation must remain disabled unless a later PRD explicitly enables patch capture and review.

## Output And Artifact Requirements

Standard output, standard error, generated files, and summaries must be recorded as artifact references, not embedded wholesale in workflow events.

Output capture must support:

- bounded byte limits,
- redaction before display,
- log truncation marker,
- exit code,
- start and stop timestamps,
- cancellation reason,
- timeout reason,
- retry/failure classification.

## Session And Secret Boundary

Direct subscription-agent launch must not inherit arbitrary credentials or session state.

Required controls:

- explicit environment allowlist,
- no raw secret values in prompts, logs, events, or artifacts,
- no credential files mounted into job workspaces by default,
- operator-approved session scope if a future agent requires authentication,
- revocation and disable plan.

## Approval Binding

Launch approval must bind:

- work item id,
- execution attempt id,
- route decision id,
- worker id,
- lane,
- authority mode,
- workspace plan id,
- process policy id,
- approval expiry.

Any mismatch must reject launch and record a non-executing event.

## Rollback And Recovery

Future launch work must define:

- how to cancel a running process,
- how to detect and clean orphaned processes,
- how to archive partial output safely,
- how to revert workspace changes,
- how to retry without reusing stale approval,
- how to disable the launcher globally.

## Stop Line

This design remains below the stop line. Do not implement direct launch until a PRD approves the exact launch target and tests.

Still denied:

- Codex, Claude, Gemini, Antigravity, or other subscription-agent process launch,
- local or remote provider/model calls,
- premium execution,
- arbitrary shell execution,
- source mutation,
- network access,
- credential access.
