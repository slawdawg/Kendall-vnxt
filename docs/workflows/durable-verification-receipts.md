# Durable verification receipts

## Purpose

`scripts/verification-receipt.mjs` supervises the one unfiltered workspace
fixture command whose terminal capture may outlive an ordinary shell bridge.
It creates compact local evidence before execution so an orphaned wrapper can
be distinguished from a passing or failing suite without treating partial
output as success.

The runner is local-only. It does not call Git or GitHub, fetch, push, create
or merge pull requests, deploy, clean up a lane, or invoke `finish-pr`.
It is evidence collection, not a delivery bypass.

## Required command

The child command is fixed and cannot be changed by a flag:

```text
script -e -q -c 'pnpm run test:codex-workspace' <durable-log>
```

Use an absolute receipt state directory outside the source worktree and an
absolute durable log path outside that state directory. Each existing state or
log component must be owned by the runner's effective user and must not be
group- or other-writable. Create private parents first; `/var/tmp` itself is
not an eligible state or log parent. The runner canonicalizes each existing
ancestor and rejects a symlinked state/log ancestor or any resolved target in
the worktree; do not use a symlink as a convenience path.

```bash
install -d -m 700 /var/tmp/kendall-verification
install -d -m 700 /var/tmp/kendall-verification/state
install -d -m 700 /var/tmp/kendall-verification/logs
node ./scripts/verification-receipt.mjs start \
  --task <managed-task-id> \
  --owner <manifest-owner-id> \
  --worktree-root "$(git rev-parse --show-toplevel)" \
  --state-dir /var/tmp/kendall-verification/state \
  --log /var/tmp/kendall-verification/logs/workspace-suite.log \
  --no-progress-ms 1800000 \
  --invocation <unique-run-id>
```

The worktree root is canonicalized; the caller's current subdirectory cannot
move the source boundary. The default heartbeat is five seconds; the default
no-progress deadline is four minutes. The command stays attached while it
observes the receipt. The runner requires Linux `/proc` start-time, session,
and process-group identity proof. It fails closed when that proof is
unavailable. `--child-grace-ms` must be a positive bounded value; zero is
rejected rather than disabling the recent-progress guard. It also clears every
`CODEX_WORKSPACE_TEST_*` inherited variable
before spawning `script`, so no filter, profile, or future suite-scope selector
can narrow the literal command.

For the literal full `test:codex-workspace` suite, use the explicit
`--no-progress-ms 1800000` value shown above. The repository's raw-suite
delivery allowance is thirty minutes and the suite can produce long quiet
fixture groups; a `script` exit trailer is not substitute terminal evidence.
Do not rerun an inconclusive capture with the same shorter observation window.

## Receipt and stop line

Before creating the `script` process, the runner atomically reserves the log,
writes an owner-bound `launch_claimed` receipt, and records the exact monitor
claim. After `script` is spawned it durably records the wrapper PID/start
identity/process group/session in `spawned` before it transitions to `running`.
These phases make a crash before or immediately after spawn recoverable without
ever treating it as a terminal result.

The receipt is private at:

```text
<state-dir>/receipts/<task-id>/<invocation-id>.json
```

It records the task and owner binding, invocation ID, fixed command digest,
log path, source worktree path, wrapper PID/start identity/process group,
supervisor identity, start and heartbeat timestamps, compact log observation,
owned wrapper-descendant identities, termination state, and eventual terminal
evidence including a bounded log digest rather than a retained source or
provider payload. A sibling durable-log reservation rejects a concurrent
receipt using the same log even if it uses another state directory.

A receipt is `passed` only when all of these are true:

1. The exact owned wrapper exits with code zero and no signal.
2. The final durable-log region is the deterministic
   `test:codex-workspace` terminal evidence: enough `OK:` records to satisfy
   the final `WORKSPACE_TEST_PROFILE_SUMMARY` JSON's positive
   `executedTestCount`, and that profile must be `all`. Only the normal `script`
   trailer may follow it. A
   complete Node TAP footer with positive `# pass` and `# fail 0` is also
   accepted when that is the emitted suite shape. An early forged summary
   followed by later output is not accepted.
3. The receipt command, task, owner, log path, and process identity still match.

Any nonzero exit is `failed`. A zero exit without the summary, a missing owned
wrapper, bounded no progress in the receipt-bound durable log, or
process-identity/proof drift is `lifecycle_inconclusive`; none is passing
evidence. Missing eligible child visibility alone is diagnostic and does not
terminalize the receipt. Do not advance review or delivery on an inconclusive
state.

## Controlled termination and recovery

When the no-progress deadline or child close fires, the
receipt enters `terminating` and retains its monitor and log locks while it
settles the exact owned group. A `script` wrapper can have no observable
same-group child while its bound durable log is still advancing, so missing
child visibility is not terminal while recent verified progress and the exact
wrapper identity remain. Child visibility is diagnostic only: when it remains
absent, the runner continues until the existing bounded no-progress deadline
measured from verified bound-log progress. At that deadline it records a
truthful inconclusive result and retains the same-log fence; identity/proof
drift remains immediate and fail-closed.
It follows known wrapper lineage and uses a
bounded `pgrep -g <persisted-group>` membership proof, checking each returned
member's persisted group/session/start identity; it does not enumerate or
inspect unrelated `/proc` processes. This catches a forked or reparented
same-group survivor. It sends `SIGTERM` only to the re-proved exact group, then
may send `SIGKILL` after the bounded grace period. `controlled_termination` is
true only after a successful signal and an empty-group proof.

If the group cannot be proven empty, proof becomes unavailable (including the
spawned-before-identity window or a later `pgrep` failure), or the bounded
settlement deadline expires (including a signal failure or survivor), the
receipt is terminal `lifecycle_inconclusive`. It releases the monitor lock so
the lifecycle result is durable, but deliberately retains the same-log claim
as a replacement fence: a later invocation cannot reuse ambiguous evidence.
That is not an active monitor lock or a claimed pass; it is a durable stop line
until the normal governed recovery procedure chooses a new log/invocation.

If the supervising runner itself disappears while the exact child remains,
resume with the same task, owner, invocation ID, receipt state directory, and
log path:

```bash
node ./scripts/verification-receipt.mjs resume \
  --task <managed-task-id> \
  --owner <manifest-owner-id> \
  --worktree-root "$(git rev-parse --show-toplevel)" \
  --state-dir /var/tmp/kendall-verification/state \
  --log /var/tmp/kendall-verification/logs/workspace-suite.log \
  --invocation <same-run-id>
```

Resume rejects a changed task, owner, command digest, log, receipt version,
live prior supervisor, PID, start identity, process group, or log claim. A
recovered pre-spawn claim becomes `pre_spawn_interrupted`. If the detached
wrapper is already gone, resume has no trustworthy exit status and records
`exit_status_unavailable_after_supervisor_loss`; a changed live PID identity is
recorded as `process_identity_drift`. Neither result is a recoverable pass or
fail claim. Start a new governed verification attempt only through the normal
lane protocol.

## Verification

Run the focused lifecycle fixture while changing this runner:

```bash
node --test scripts/test-verification-receipt.mjs
```

The fixture covers actual workspace-summary and TAP terminal shapes, forged
early summaries, success/failure/interruption, close-time group settlement,
fork/reparent survival, no-progress termination, TERM survival/escalation and
signal failure, settlement-deadline fencing, owner/permission and same-log
hostility, exact launch/spawn crash recovery, bounded unrelated-PID avoidance,
canonical nested-cwd source denial, missing-`script` spawn errors, and
binding/process drift. It also covers symlinked ancestor denial, inherited
suite-selector stripping, and timer shutdown after an asynchronous spawn
error, plus monitor/resume recovery of an unproven spawned identity with its
same-log fence retained. It does not claim the full workspace suite has passed;
only a terminal passing receipt from the literal required command can establish
that evidence.
