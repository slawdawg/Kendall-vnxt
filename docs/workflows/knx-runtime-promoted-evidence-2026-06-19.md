# KNX Runtime Promoted Evidence

Date: 2026-06-19
Status: promoted historical evidence

## Purpose

Promote the still-useful generic conclusions from the first KNX runtime cleanup
slice into durable docs before any runtime cleanup. This artifact covers:

- `_bmad/memory/knx/runtime/handoffs/**`
- `_bmad/memory/knx/runtime/runtime-inventory/**`
- `_bmad/memory/knx/runtime/source-inventory/**`

This promotion does not delete, untrack, sanitize in place, regenerate, or
rewrite any runtime files. The runtime copies remain available as historical
provenance until a later explicitly approved cleanup PR.

## Promoted Conclusions

### KNX State And Routing

- KNX governance core was scaffolded and validated in the local-first
  development lane.
- The optional `ksev` source/evidence validator was scaffolded and validated as
  a local-only validator capability.
- Metadata-only source packet examples were materialized and validated.
- `ksev` validation covered both synthetic fixture packs and metadata-only
  source packet examples.
- Runtime assistant behavior, public distribution, company sharing, external
  provider sends, customer or production access, credential workflows, local
  model/GPU processing, and destructive actions remained hard-gated.
- Future KNX work should route by concrete capability:
  - use `knx-source-evidence-contract` for source, evidence, packet, and
    traceability contract changes;
  - use `knx-safety-validation-review` before optional pack changes, public
    release paths, external sends, source mutation, operational intake, or
    expanded data access;
  - use `knx-mature-tool-review` before new tooling, source inventory
    materialization, or automation decisions;
  - use `bmad-module-builder` only for named packaging or validation changes;
  - refresh reports, handoff summaries, backlog, and indexes only after scoped
    state changes.

### Validation Evidence

- KNX governance-core module validation passed with no findings.
- Optional `ksev` module validation passed with no findings.
- Optional `ksev` packaged tests passed in the historical local lane.
- Synthetic fixture validation passed with no findings.
- Source packet example validation passed with no findings.
- Marketplace manifest JSON parsing passed.
- `git diff --check` passed for the scoped local changes at the time.
- Targeted secret-pattern scanning over the scoped KNX changed paths found no
  matches.
- Later local closure evidence recorded all required local validations passing.

These are retained as historical evidence. They are not fresh validation for
the current checkout.

### Inventory Boundary

- Source inventory and runtime evidence inventory were intentionally separate.
- Source inventory covered KNX governance records, decisions, synthetic
  fixtures, optional validator source, local module marketplace manifest, and
  module validation reports.
- Runtime evidence inventory covered generated KNX runtime evidence groups such
  as commit readiness, handoffs, module validation, optional validator output,
  source inventory, and workflow audits.
- Both inventory passes were metadata/path-count passes. They did not copy file
  contents, include checksums, or prove sensitive content was absent.
- The inventory artifacts explicitly recorded that source mutation, external
  sends, package installs, and runtime assistant behavior were not performed.

## Sanitized Local Details

The promoted conclusions intentionally omit concrete local machine roots,
absolute workspace paths, local user names, and machine-specific storage roots.
The original runtime files still contain some local path evidence and remain the
historical source until a later cleanup PR untracks or deletes the named files.

Sanitized categories:

- local source roots;
- local runtime storage roots;
- local user/worktree markers;
- runtime path metadata that reveals machine-specific checkout structure.

## Later Cleanup Candidates

The following files now have their durable generic conclusions promoted above.
They are candidates for a later cleanup PR, subject to a fresh review and Bob's
explicit approval for the named action:

- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01.md`
- `_bmad/memory/knx/runtime/runtime-inventory/runtime-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/runtime-inventory/runtime-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/runtime-inventory/work-trace-runtime-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-inventory/validation-source-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-inventory/work-trace-source-inventory-2026-06-01.md`

Recommended later action: untrack these files with `git rm --cached` if Bob
needs to preserve the local runtime copies, or delete them only after Bob
approves the exact named file list. Do not remove validator source, validator
tests, source packet examples, or source packet validation reports as part of
this batch.

## Reference Scan Result

A repository reference scan for
`_bmad/memory/knx/runtime/(handoffs|runtime-inventory|source-inventory)/`
shows that future cleanup must account for references in:

- this promoted evidence record and the related workflow inventory/decision
  records;
- `_bmad/memory/knx/index.md`;
- `_bmad/memory/knx/source-evidence-contract.md`;
- KNX decision records under `_bmad/memory/knx/decisions/**`;
- the runtime files themselves.

Before any later untracking or deletion PR removes these files, active
evidence pointers should either be replaced with this promoted record, kept as
explicit historical provenance, or removed only when the referencing record is
also retired. The future cleanup PR should not leave broken required-evidence
links.

## Required Future PR Evidence

Any later PR that removes or untracks the files above must include:

- exact files removed or untracked;
- whether local copies were preserved with `git rm --cached` or deleted;
- rollback command for the exact file list;
- `rg` scan for local root markers in the touched paths before and after;
- `rg` scan for references to each removed runtime path;
- reference replacement or historical-provenance treatment for active KNX
  memory pointers;
- docs index check results;
- confirmation that no validator source, validator tests, source packet
  examples, or source packet reports were removed.

## Related Records

- `docs/workflows/knx-runtime-and-bmad-output-inventory-2026-06-19.md`
- `docs/workflows/knx-runtime-cleanup-decision-2026-06-19.md`
