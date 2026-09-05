# Hermes Follow-Up Admissions

`POST /hermes-control-plane/follow-ups` records a metadata-only, evidence-bound
follow-up proposal. It does not create a lane, schedule work, invoke a worker,
or grant delivery authority.

## Prerequisites and startup

Run the Supervisor locally using the normal [Supervisor service
instructions](../../services/supervisor/README.md). The route is protected by
the same local operational boundary as the Hermes ledger; do not expose it
through a public proxy or browser-facing route.

Send only `follow_up_work.v2` records. V2 binds `parentOutcomeId` and the
current `parentLaneRunId`, and requires evidence references already persisted
for that exact parent. `follow_up_work.v1` remains a read/validation contract
for legacy producers but is not accepted for a lane-bound admission because it
lacks the required lane binding.

## Safe operation

Each request must be metadata-only, include an idempotency key and dedupe key,
and have a fresh `observedAt` at or after the parent outcome and lane revisions.
The service accepts an exact idempotent replay, rejects changed replays and
dedupe conflicts, and rejects expired or stale proposals. It persists no raw
payload, credential, queue state, or worker output.

Follow-up rows are append-only at the database layer. Correction or expiry is
represented by a new bounded record; never update or delete an admitted row.

## Failure and recovery

A `409 hermes_follow_up_conflict` means the parent binding, evidence,
freshness, expiry, idempotency, or dedupe fence was not proven. Refresh the
parent ledger evidence and submit a new proposal with a new idempotency/dedupe
identity only when it represents new work. Do not retry a changed request under
the same idempotency key.

There is no automatic execution or recovery action for this route. A later
approved recovery engine must consume only durable, valid admission records and
must retain its own authority and delivery gates.

## Secrets

Do not include credentials, tokens, raw provider data, transcripts, or source
payloads in titles, summaries, rationale, evidence references, or actions.
These records are deliberately metadata-only.
