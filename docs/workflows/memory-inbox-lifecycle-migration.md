# Memory Inbox lifecycle persistence migration

## Scope

Story 1.2 installs only additive, empty `memory_inbox_*` lifecycle tables via
the supervisor's existing `Base.metadata.create_all` startup path. These tables
hold opaque identifiers, closed lifecycle state, revisions, and audit/policy
references only. They do not enable an Inbox API, inventory, capture, content
store, provider, job dispatch, or deletion execution.

Legacy `memory_proposals`, `memory-captures`, work-packet, queue, and execution
tables remain segregated and are not read, linked, or migrated by this change.

## Proposal reader capability

The private proposal reader is disabled by default. To enable it for an
operator-controlled dashboard, set both
`SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_ENABLED=true` and a non-empty,
operator-approved `SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_CAPABILITY_REF`.
The dashboard forwards only the exact revision reader route for operator
sessions; viewers and mutation methods are denied. Keep the content-store root
private and set `SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_MAX_BYTES` to the
smallest useful bound.

Before enabling, verify that the capability reference identifies the approved
reader grant and that the private-content store has the expected owner-only
permissions. To disable or recover from a suspected disclosure, unset the
enabled flag, restart the supervisor, revoke the affected reader grant through
the deletion/approval workflow, and preserve its audit evidence. Do not expose
the supervisor's private UDS directly or copy proposal bodies into dashboard
logs, browser storage, or public monitoring.

## Rollback

Rollback is a capability rollback: restore the prior supervisor binary and
leave the inert tables and any retained lifecycle evidence in place. Do not
drop tables or rows. Any destructive cleanup requires a separately approved
retention and deletion plan.

## Verification

SQLite (the normal local path):

```bash
uv run --directory services/supervisor pytest -q tests/test_memory_inbox_lifecycle_persistence.py
```

For an isolated PostgreSQL database configured through the normal supervisor
settings, initialize the supervisor once, then run the same focused test suite
against that isolated database. Never point this verification at production or
reuse legacy MemoryProposal rows as fixtures.
