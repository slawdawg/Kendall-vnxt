# Supervisor Schema Migrations

Status: active Phase 1 foundation

The supervisor database is upgraded through ordered revisions recorded in
`supervisor_schema_migrations`.  Application startup calls the migration runner
inside one database transaction; it does not select schema changes from the
running application version or replay already applied revisions.

## Current revisions

1. `0001_model_baseline` creates the schema represented by the frozen ORM
   snapshot captured for revision `0001`.
2. `0002_legacy_compatibility` carries the existing additive compatibility
   work for databases created before the migration boundary.

These revisions deliberately preserve current behavior.  They form the
baseline from which later schema changes must be introduced as a new ordered
revision, with an upgrade fixture and rollback/capability-recovery evidence.
Do not add `ALTER TABLE`, index, trigger, or data backfill work directly to
`init_db`.

## Clean-install stamping contract

The runner calls a database a clean install only when its current schema has
no tables before migration bookkeeping is created. It runs
`0001_model_baseline`, which materializes the frozen ORM snapshot captured for
that revision, then records each later revision without replaying its upgrade
body. This avoids a later non-idempotent upgrade running against schema that a
moving application metadata baseline has already created.

The `models_baseline.py` snapshot is historical migration source, not a second
live model layer: do not update it when application models change. Add the new
ordered revision and its clean-install hook instead.

A later revision must declare a `clean_install` hook when clean installation
needs schema or state beyond the frozen baseline: future ORM tables or columns,
data initialization, triggers, indexes, compatibility objects, or any other
SQL side effect. The hook runs before that revision is recorded. With no hook,
the revision contract is that no extra clean-install state is required, so it
is stamped only. `0002_legacy_compatibility` declares a hook because it
installs compatibility state outside the ORM metadata.

Any nonempty database is an existing-schema bootstrap, whether
`supervisor_schema_migrations` is absent, present, or partial. The runner
applies the same frozen `0001_model_baseline` to supply any missing historical
tables, then runs every later unapplied upgrade revision in order. This
preserves partial legacy-schema recovery without materializing future ORM
objects before the revisions that introduce them. Missing or partial
bookkeeping is never treated as a clean install.

## Operating rules

- SQLite remains the default supported target.  PostgreSQL changes require an
  active documented requirement and isolated upgrade coverage before support is
  claimed.
- A revision is recorded only after its upgrade or clean-install hook completes
  in the enclosing transaction. A failed revision therefore leaves no applied
  marker and must fail closed.
- The current compatibility revisions are additive.  Their rollback is a
  capability rollback to the previous supervisor binary while retaining the
  additive schema and data; never drop tables or erase data as a rollback
  shortcut.
- Future reversible changes must state their explicit downgrade procedure.  A
  destructive or lossy migration needs separately reviewed retention and
  recovery authority.

## Required evidence for a new revision

1. Clean-install test proving the target schema and applied revision list.
2. Old-database fixture proving upgrade, idempotent restart, and data
   preservation.
3. SQLite coverage and, when PostgreSQL is supported by the change, an
   explicitly isolated PostgreSQL test.
4. Rollback or capability-recovery procedure with its data-retention impact.

The migration runner lives in
`services/supervisor/src/supervisor/infrastructure/db/migrations.py`.  The
focused lifecycle-persistence suite is the initial clean-install, legacy
upgrade, and restart-preservation proof.
