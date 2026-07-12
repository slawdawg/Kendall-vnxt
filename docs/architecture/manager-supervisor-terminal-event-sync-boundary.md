# Manager-to-Supervisor Terminal Event Sync Boundary

Date: 2026-07-12
Status: source-owned architecture contract

## Decision

Manager refill planning remains deterministic and network-free. `buildRefillPlan`
and `scripts/manager-refill-plan.mjs` may produce an
`authoritative_backlog_exhausted` packet whose terminal dispositions remain in
`canonicalEventIntegration=missing_supervisor_contract`; they do not contact the
supervisor and do not claim canonical persistence.

Canonical persistence is a separate, explicit side effect:

```text
built manager refill packet
  -> manager-supervisor-terminal-event-sync (explicit operator command)
  -> loopback POST /manager-control-plane/terminal-events
  -> exact response identity validation
  -> cloned packet marked supervisor_canonical_event
```

Run the command with a previously built JSON packet and an uncredentialed
loopback supervisor base URL:

```bash
pnpm run manager:supervisor-terminal-event-sync -- \
  --input /path/to/refill-packet.json \
  --supervisor-url http://127.0.0.1:8000
```

The command accepts only `localhost`, `127.0.0.1`, or `::1`. It derives the
event ID deterministically from the terminal disposition idempotency key and
sends only the allowlisted `authoritative_backlog_exhausted` metadata required
by the supervisor contract. It never forwards the enclosing packet, raw
payloads, provider output, commands, or work-creation/dispatch instructions.

## Commit Point and Failure Semantics

The input packet is never mutated. The command returns a cloned, integrated
packet only after a 2xx JSON response contains the same complete event identity
and a bounded persistence timestamp. The returned terminal dispositions carry
the supervisor event ID, a bounded evidence reference, persisted status, and
timestamp. Only `missing_supervisor_contract` blockers are removed; approval-
gated warnings, unrelated blockers, next actions, and stop lines remain.

Non-loopback URLs, unavailable networking, non-2xx responses, malformed data,
or identity conflicts fail closed. Failure packets retain
`canonicalEventIntegration=missing_supervisor_contract`, retain or restore the
missing-contract blocker, and add a typed sync blocker. No failure path may
create or dispatch work.

## Replay

The event ID is a bounded SHA-256-derived identifier over the existing
idempotency key. Replaying the same unsynced packet therefore POSTs the same
event ID and metadata. The supervisor owns conflict detection and canonical
persistence; the manager independently rejects any returned identity drift.
