# Memory Inbox lifecycle persistence migration

## Scope

Story 1.2 installs only additive, empty `memory_inbox_*` lifecycle tables via
the supervisor's existing `Base.metadata.create_all` startup path. These tables
hold opaque identifiers, closed lifecycle state, revisions, and audit/policy
references only. They do not enable an Inbox API, inventory, capture, content
store, provider, job dispatch, or deletion execution.

Legacy `memory_proposals`, `memory-captures`, work-packet, queue, and execution
tables remain segregated and are not read, linked, or migrated by this change.

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
