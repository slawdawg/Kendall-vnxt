# Manager-to-Supervisor Source Intake Boundary

Date: 2026-07-12
Status: bounded Gate 4 source-owned architecture contract

## Decision

The normal manager source-candidate path remains read-only and network-free.
`manager:source-packet-seed`, refill planning, cycle planning, and the manager run
loop do not contact the supervisor. An eligible source-backed seed can cross
into the supervisor-owned authoritative WorkPacket lifecycle only through the
separate explicit command:

```text
manager:source-packet-seed (read-only eligible CandidateWorkPacket metadata)
  -> manager:supervisor-source-intake (explicit command)
  -> loopback POST /pipeline-control-plane/work-packets
  -> exact packet and packet.created event identity validation
  -> supervisor persistence and live projection truth
```

This is the smallest honest normal-path integration for this Gate 4 slice. It
does not wire intake into `manager-cycle-packet`, `manager-refill-plan`, or
`manager-run-loop`, and therefore is not full Gate 4 completion.

## Explicit Command

First produce a source-backed manager packet without network access:

```bash
pnpm run manager:source-packet-seed -- \
  --candidate-id gate-4-source-candidate \
  --title "Gate 4 source candidate" \
  --source-ref doc:docs/workflows/current-session-runbook.md \
  --acceptance-criterion "Supervisor owns persisted lifecycle truth." \
  --verification-target "pnpm run test:manager-source-intake" \
  --touched-surface scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs \
  --risk-class low \
  --authority-class allowed_unattended > /tmp/gate-4-source-packet.json
```

Then explicitly submit the eligible packet to a local supervisor:

```bash
pnpm run manager:supervisor-source-intake -- \
  --input /tmp/gate-4-source-packet.json \
  --supervisor-url http://127.0.0.1:8000
```

The adapter accepts only uncredentialed `localhost`, `127.0.0.1`, or `::1`
HTTP(S) base URLs. The packet must contain exactly one eligible
`summary.seedPacket` and one explicit source reference. Supported mappings are
`prd:` to `prd`, `story:` to `bmad_story`, `doc:` to `repo_doc`,
`runway:`/`workflow:` to `workflow`, and `operator:` to `operator_input`.
Input is capped at 256 KiB. Duplicate input or supervisor target flags are
rejected, and network timeouts are bounded to 1-30 seconds.

## Data and Authority Boundary

Only allowlisted lifecycle metadata crosses the boundary: deterministic packet,
idempotency, and correlation IDs; candidate title; one source identity and
repository-relative path where applicable; manager actor metadata; one bounded
summary; and deterministic evidence references. Acceptance-criteria text,
verification commands, dependencies, enclosing manager packets, BMAD story
bodies, prompts, completions, provider payloads, reasoning traces, secrets, and
terminal output are not sent or retained.

Before POST, the adapter cross-checks the seed against the manager packet's
single eligible candidate projection and single source-artifact discovery
projection. Authority must remain `allowed_unattended`, risk must remain low or
medium, every raw-retention marker must remain false, and unsafe or unbounded
fields are rejected rather than reflected into failure output.

The command creates no CandidateWork row, WorkItem, execution attempt, queue
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
supervisor using a temporary SQLite database, runs the explicit intake command,
and reads both the authoritative lifecycle route and live pipeline projection.
It also proves zero CandidateWork, WorkItem, workflow event, execution attempt,
or queue-lease rows; unchanged source bytes; and absence of an injected raw
BMAD marker from persisted database bytes. Environments that deny loopback
sockets identify that sandbox boundary and require the exact command outside
the sandbox.
