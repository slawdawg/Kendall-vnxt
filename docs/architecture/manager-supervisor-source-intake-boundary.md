# Manager-to-Supervisor Source Intake Boundary

Date: 2026-07-12
Status: bounded Gate 4 source-owned architecture contract

## Decision

The normal manager source-candidate path remains read-only and network-free.
`manager:source-packet-seed`, refill planning, cycle planning, and the manager
run loop do not contact the supervisor by default. Supplying an explicit
loopback `--supervisor-url` lets refill/cycle planning project one source-intake
action only when exactly one source-backed seed is eligible. The run loop still
performs no network operation in `continuous_dry_run`; `continuous_apply` may
cross the boundary only after its dry-run proof, exact target pairing,
`sourceIntake` capability gate, and continuation gate all pass.

```text
manager refill/cycle (pure action projection)
  -> exactly one eligible source-backed seed + explicit loopback URL
  -> manager:source-intake-cycle --dry-run (validation, no fetch)
  -> exact command family / canonical target / sourceIntake gates
  -> manager:source-intake-cycle --apply
  -> buildSourceBackedPacketSeedPlan (read-only eligibility first)
  -> refuse blocked / needs-review / dedupe / non-eligible states
  -> intakeManagerSourcePacket (eligible only)
  -> loopback POST /pipeline-control-plane/work-packets
  -> exact packet and packet.created event identity validation
  -> supervisor persistence and live projection truth
```

The standalone command remains compatible: no mode flag retains its prior
explicit-apply behavior, while `--dry-run`/`--plan` and `--apply` make the gate
visible for continuous orchestration. The dry-run returns the exact candidate,
packet, source, and loopback endpoint target components without fetching.

## Explicit Command

Run the cycle with the same source-backed seed inputs plus a loopback supervisor
URL:

```bash
pnpm run manager:source-intake-cycle -- \
  --candidate-id gate-4-source-candidate \
  --title "Gate 4 source candidate" \
  --source-ref doc:docs/workflows/current-session-runbook.md \
  --acceptance-criterion "Supervisor owns persisted lifecycle truth." \
  --verification-target "pnpm run test:manager-source-intake" \
  --touched-surface scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs \
  --risk-class low \
  --authority-class allowed_unattended \
  --supervisor-url http://127.0.0.1:8000 \
  --dry-run
```

After reviewing the dry-run packet, rerun the exact command with `--apply` in
place of `--dry-run`. For long-lived operation, the same seed flags and URL may
be supplied to `manager-cycle-packet` or `manager-run-loop`; omitting the URL
preserves the network-free default.

The pre-existing `manager:source-packet-seed` remains available as a pure,
network-free planning command. The lower-level
`manager:supervisor-source-intake` remains available for explicit submission of
an already-planned eligible packet. Their invocation and authority boundaries
remain unchanged; successful adapter results now keep the original eligibility
projection separate from the seed packet's supervisor-persistence annotation.

The adapter accepts only uncredentialed `localhost`, `127.0.0.1`, or `::1`
HTTP(S) base URLs. The packet must contain exactly one eligible
`summary.seedPacket` and one explicit source reference. Supported mappings are
`prd:` to `prd`, `story:` to `bmad_story`, `doc:` to `repo_doc`,
`runway:`/`workflow:` to `workflow`, and `operator:` to `operator_input`.
Input is capped at 256 KiB. Duplicate input, mode, or supervisor target flags
are rejected, and network timeouts are bounded to 1-30 seconds.

## Data and Authority Boundary

Only allowlisted lifecycle metadata crosses the boundary: deterministic packet,
idempotency, and correlation IDs; candidate title; one source identity and
repository-relative path where applicable; manager actor metadata; one bounded
summary; and deterministic evidence references. Acceptance-criteria text,
verification commands, dependencies, enclosing manager packets, BMAD story
bodies, prompts, completions, provider payloads, reasoning traces, secrets, and
terminal output are not sent or retained.

Before any adapter call, the cycle requires both planner packet state and seed
eligibility decision to be exactly `eligible`. Blocked, needs-review,
dedupe/skipped, no-seed, or any other state is returned as typed blocked evidence
without fetch. Before POST, the adapter cross-checks the seed against the manager packet's
single eligible candidate projection and single source-artifact discovery
projection. Authority must remain `allowed_unattended`, risk must remain low or
medium, every raw-retention marker must remain false, and unsafe or unbounded
fields are rejected rather than reflected into failure output.

Continuous apply additionally requires the selected mutation class to remain
`source_backed_supervisor_intake`, the `sourceIntake` manager capability to be
enabled, continuation evidence to set `sourceIntakeAllowed`, and dry-run/apply
commands to match by command family and canonical target after mode flags are
removed. Any mismatch stops before apply.

The cycle creates no CandidateWork row, WorkItem, execution attempt, queue
lease, worker process, dispatch action, provider call, or source mutation. The
supervisor owns the authoritative WorkPacket and `packet.created` lifecycle
event after the POST succeeds.

## Fail-Closed Commit Point

Non-loopback URLs, ineligible or ambiguous candidates, multiple source refs,
raw-retention flags, unsafe metadata, network failures, non-2xx responses,
malformed lifecycle data, or any response identity drift produce a typed blocked
packet. The input remains unchanged and no supervisor persistence is claimed.

Success requires the response to contain the same packet ID, title, source ref,
truth label, and exact metadata-only `packet.created` event identity, including
actor, idempotency key, correlation ID, summary, and evidence refs. The returned
manager packet records only the persisted supervisor packet ID, current stage,
status, current event ID, timestamp, and evidence reference.

## Reproducible Integrated-Local Proof

Run:

```bash
pnpm run test:manager-source-intake
```

The test starts with `manager-source-packet-seed`, starts a real loopback
supervisor using a temporary SQLite database, proves cycle dry-run performs no
fetch, applies the exact cycle target, and reads both the authoritative
lifecycle route and live pipeline projection.
It also proves zero CandidateWork, WorkItem, workflow event, execution attempt,
or queue-lease rows; unchanged source bytes; and absence of an injected raw
BMAD marker from persisted database bytes. Environments that deny loopback
sockets identify that sandbox boundary and require the exact command outside
the sandbox.
