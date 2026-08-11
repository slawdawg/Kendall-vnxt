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
The dashboard forwards the exact revision reader route and three proposal
decisions (`return`, `deny`, and `approve`) for operator sessions only. Those
decision requests require a same-origin `POST` and the operator CSRF token;
viewers, queries, other methods, and every other proposal subresource are
denied. `approve` starts the audited deletion barrier, which revokes reader
grants and schedules deletion work—it does not itself prove content deletion.
Keep the content-store root private and set
`SUPERVISOR_MEMORY_INBOX_PROPOSAL_READER_MAX_BYTES` to the smallest useful
bound.

Before enabling, verify that the capability reference identifies the approved
reader grant and that the private-content store has the expected owner-only
permissions. To disable or recover from a suspected disclosure, unset the
enabled flag, restart the supervisor, use the audited decision/deletion
workflow to revoke affected reader grants, and preserve its audit evidence. Do
not expose the supervisor's private UDS directly or copy proposal bodies into
dashboard logs, browser storage, or public monitoring.

## Legacy lifecycle-table upgrade

The ownership/state upgrade applies only to existing `memory_inbox_*` lifecycle
tables. It is one startup transaction and must be run against a database backup
or a verified isolated clone before deployment. It does not inspect, infer from,
or attach legacy proposal/capture content.

1. Take a backup and stop the old supervisor before starting the version that
   contains this migration.
2. Before adding either explicit-owner target column, the startup migration
   checks whether a legacy `memory_inbox_manifests.owner_revision_id` resolves
   to both revision tables and fails closed without attempting that schema
   alteration. It then performs an **explicit owner backfill**: a legacy
   `owner_revision_id` is copied to
   `source_revision_id` only when it matches exactly one owner kind in
   `memory_inbox_source_revisions`, or to `proposal_revision_id` only when it
   matches exactly one owner kind in `memory_inbox_proposal_revisions`.
3. It then installs the one-owner check, revision foreign keys, per-owner copy
   indexes, and closed source/proposal revision-state checks. Do not manually
   add a second owner or bypass those constraints.
4. Legacy rows with an unknown owner, no owner, an owner identifier that exists
   in both revision tables, or two explicit owners **fail closed**.
   Startup raises `Memory Inbox manifest ownership migration found
   unresolved references.` and rolls back; do not remove the check or replace
   the owner with a guess. Correct the source-owned legacy reference, then
   rerun the same migration.

After deployment, verify all of the following before enabling any Inbox
capability:

```sql
SELECT id FROM memory_inbox_manifests
WHERE (source_revision_id IS NULL AND proposal_revision_id IS NULL)
   OR (source_revision_id IS NOT NULL AND proposal_revision_id IS NOT NULL);

SELECT constraint_row.conname
FROM pg_constraint AS constraint_row
JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
WHERE schema.nspname = current_schema()
  AND (relation.relname, constraint_row.conname) IN (
    ('memory_inbox_manifests', 'ck_memory_inbox_manifest_single_owner'),
    ('memory_inbox_manifests', 'fk_memory_inbox_manifest_source_revision'),
    ('memory_inbox_manifests', 'fk_memory_inbox_manifest_proposal_revision'),
    ('memory_inbox_source_revisions', 'ck_memory_inbox_source_revision_state'),
    ('memory_inbox_proposal_revisions', 'ck_memory_inbox_proposal_revision_state')
  );
```

The first query must return no rows and the second must return all five named
constraints. Also run a targeted lifecycle persistence test against an
explicitly isolated PostgreSQL database before declaring the migration ready.

## Rollback

Rollback is a capability rollback: first disable every Memory Inbox write path
(capture, upload, approval, dispatch, and proposal-manifest creation), then restore the prior supervisor binary and
leave the inert tables, explicit-owner data, and any retained lifecycle
evidence in place. Do not
drop tables or rows. If the migration itself fails, it has rolled back as one
transaction; correct the invalid legacy owner/state data under a separately
reviewed repair procedure before retrying. Any destructive cleanup requires a
separately approved retention and deletion plan.

## Verification

SQLite (the normal local path):

```bash
uv run --directory services/supervisor pytest -q tests/test_memory_inbox_lifecycle_persistence.py
```

For an isolated PostgreSQL database configured through the normal supervisor
settings, initialize the supervisor once, then run the same focused test suite
against that isolated database. Never point this verification at production or
reuse legacy MemoryProposal rows as fixtures.

```bash
SUPERVISOR_POSTGRES_TEST_DATABASE_URL=postgresql+asyncpg://... \
SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED=1 \
uv run --directory services/supervisor pytest -q \
  tests/test_memory_inbox_lifecycle_persistence.py
```
