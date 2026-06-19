# KNX Runtime And BMAD Output Inventory

Date: 2026-06-19
Status: read-only inventory

## Purpose

Classify tracked KNX runtime artifacts and `_bmad-output` references before any
cleanup. This report does not approve deletion, untracking, history rewrite, or
regeneration. It records what should be reviewed next so the remote repository
can stay generic without losing durable evidence.

## Inventory Summary

Tracked `_bmad/memory/knx/runtime/**`:

- 83 tracked files.
- 414,301 bytes, about 0.40 MB.
- 14 files include local root, storage root, source root, or local user/path
  markers.

Tracked references to `_bmad-output`:

- 88 files under `docs/`.
- 20 files under `_bmad/`.
- 6 files under `services/`.

These counts are not cleanup criteria by themselves. The cleanup criterion is
whether a file is durable project source, reviewed evidence, generated local
runtime state, or stale provenance that has already been promoted.

## Current Baseline

`docs/environment-recovery-and-runtime-boundary.md` already defines the repo
boundary: BMAD may create drafts under `_bmad-output/`, but durable artifacts
should be promoted into `docs/` when they need Git recovery. The generated
working copy under `_bmad-output/` remains local state.

`docs/workflows/generated-agent-artifacts.md` adds the matching agent-artifact
rule: do not remove `.agents/skills`, `.claude/skills`, or `_bmad` until source
of truth and regeneration behavior are reviewed.

## KNX Runtime Classification

### Keep Until Replacement Exists

These paths contain runnable validator/module material or source-like fixtures.
Do not untrack them until a replacement source location is chosen and checked:

- `_bmad/memory/knx/runtime/module-validation/ksev/knx-source-evidence-validator/**`
- `_bmad/memory/knx/runtime/source-packets/**`

Reason: they include validator scripts, tests, module metadata, source packet
examples, and validation reports used by KNX source/evidence workflows.

### Candidate For Sanitized Historical Evidence

These paths look like historical planning/evidence packets. They may be worth
retaining, but they should not remain the canonical place for machine-specific
paths:

- `_bmad/memory/knx/runtime/evaluation-packet/**`
- `_bmad/memory/knx/runtime/greenfield-implementation/**`
- `_bmad/memory/knx/runtime/handoffs/**`
- `_bmad/memory/knx/runtime/runtime-inventory/**`
- `_bmad/memory/knx/runtime/source-inventory/**`
- `_bmad/memory/knx/runtime/report-audits/**`
- `_bmad/memory/knx/runtime/commit-readiness/**`
- `_bmad/memory/knx/runtime/workflow-audits/**`
- `_bmad/memory/knx/runtime/backlog/**`

Recommended handling: promote any still-useful conclusions into `docs/` as
sanitized historical evidence or decision records, then untrack the local
runtime copies in a separate deletion PR.

### Candidate For Local-Only Runtime Output

These paths look like generated validator output packs and should be reviewed
for local-only treatment:

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/**`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/**`

Recommended handling: keep templates/examples only if they are product source;
move generated reports to ignored local runtime output after replacement
examples exist.

## Local Marker Findings

The following tracked paths contain local absolute paths, approved roots, or
local user/worktree markers and should be sanitized or reclassified before the
repo is considered generic:

- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01.md`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/reports/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/runtime-inventory/runtime-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/source-packets/validator-report/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/commit-readiness/reports/commit-readiness-2026-06-01.md`

Some validator source and test files also mention `source_root`,
`storage_root`, or `approved_storage_root` as schema or code fields. Those are
not cleanup issues by themselves. Only concrete local values are cleanup
candidates.

## BMAD Output Reference Classification

### Keep

Keep `_bmad-output` references in config and runtime code where they define the
local generated artifact root:

- `_bmad/config.yaml`
- `_bmad/config.toml`
- `_bmad/*/config.yaml`
- `services/supervisor/**`
- `services/supervisor/tests/**`

Reason: these are path contracts for generated local artifacts, not committed
runtime state.

### Audit And Replace When Practical

Many story and PRD docs cite `_bmad-output` files as sources. That is acceptable
only when the tracked doc contains the durable promoted content or the citation
is explicitly historical. Review these groups in small batches:

- `docs/stories/**`
- `docs/prds/**`
- `docs/goals/**`
- `docs/handoffs/**`
- `docs/linux-install/planning/**`

Recommended handling: replace local-only `_bmad-output` citations with tracked
sources where possible. When no tracked replacement exists, label the reference
as historical provenance and do not treat it as required checkout state.

### Already Aligned

`docs/environment-recovery-and-runtime-boundary.md` and
`docs/workflows/generated-agent-artifacts.md` already state that `_bmad-output`
is local/generated. Keep those guidance references.

## Proposed Cleanup Sequence

1. Create a KNX runtime cleanup decision record that names the exact runtime
   subtrees to preserve, sanitize, or untrack.
2. Move or copy still-useful conclusions from historical runtime packets into
   tracked `docs/` artifacts with local paths removed.
3. Add ignore rules only for subtrees that are proven local/generated and no
   longer tracked.
4. Untrack reviewed local runtime output with `git rm --cached` or a normal
   deletion PR, depending on whether Bob needs the local files preserved.
5. Run a reference scan for local roots and `_bmad-output` citations after each
   cleanup batch.

## Stop Lines

- Do not bulk-delete `_bmad/memory/knx/runtime/**`.
- Do not remove validator source or tests until they have a replacement source
  location.
- Do not rewrite Git history for path cleanup unless Bob separately approves a
  history remediation plan.
- Do not remove `_bmad-output` references from runtime code where they define
  local artifact roots.
- Do not mark the repo generic until tracked concrete local roots have either
  been sanitized, moved to historical evidence, or explicitly accepted as
  retained evidence.

## Next Recommended PR

Create a small KNX runtime cleanup decision record that classifies each runtime
subtree as one of:

- `durable-source`
- `historical-evidence`
- `sanitize-and-promote`
- `local-generated-output`
- `defer`

That PR should still avoid deletion unless the record names exact files and the
rollback path.

Follow-up decision record:

- `docs/workflows/knx-runtime-cleanup-decision-2026-06-19.md`

Promoted evidence:

- `docs/workflows/knx-runtime-promoted-evidence-2026-06-19.md`
- `docs/workflows/knx-greenfield-evaluation-promoted-evidence-2026-06-19.md`
