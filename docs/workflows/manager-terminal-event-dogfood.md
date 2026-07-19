# Manager Terminal-Event Dogfood

This runbook exercises the supervisor-owned terminal-event contract through one
explicit loopback command. It creates a fresh, metadata-only authoritative
refill packet in memory, derives a new run/idempotency key, posts the existing
allowlisted terminal-event request, reads the exact event back, and prints
bounded evidence.

## Prerequisites and startup

1. Start the supervisor separately using the normal project startup procedure.
   This helper never starts, restarts, or manages a supervisor process.
2. Confirm the supervisor is reachable on an uncredentialed loopback URL such
   as `http://127.0.0.1:8000`.
3. From the repository checkout, run:

   ```bash
   pnpm run manager:terminal-event-dogfood -- \
     --supervisor-url http://127.0.0.1:8000
   ```

The command prints only metadata evidence: run ID, source identity/revision,
idempotency key, canonical event ID, persistence timestamp, endpoint, and the
`metadataOnly`/`rawPayloadRetained` flags. Each invocation generates a unique
run and idempotency key. Use `--run-id` only when intentionally reproducing a
known idempotent replay.

Optional bounded overrides are `--source-identity`, `--source-revision`, and
`--run-id`. The supervisor URL must be `localhost`, `127.0.0.1`, or `::1`, with
no credentials, path, query, or fragment.

## Failure and recovery

- A non-loopback or malformed URL fails before network access.
- An unavailable supervisor returns `blocked` metadata evidence and leaves the
  packet unsynced. Start the supervisor, then rerun the command with a fresh
  run ID.
- HTTP, malformed-response, or identity-conflict failures fail closed. The
  helper never creates work, dispatches work, writes manager state, or mutates
  the input packet (the packet exists only in memory).
- Reusing the same `--run-id` intentionally exercises the existing supervisor
  idempotency/conflict behavior; do not treat a replay as a fresh run.

The helper does not forward raw prompts, completions, provider payloads,
credentials, commands, or dispatch instructions. It is a local dogfood proof,
not a replacement for source-backed refill reconciliation or automatic runtime
startup.
