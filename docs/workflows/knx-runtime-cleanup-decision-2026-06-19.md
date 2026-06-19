# KNX Runtime Cleanup Decision

Date: 2026-06-19
Status: decision record

## Decision

Do not bulk-delete `_bmad/memory/knx/runtime/**`. Treat the runtime tree as a
mixed historical/local workspace with a small amount of source-like validator
material. Cleanup must proceed by subtree classification, promotion, and
explicit rollback, not by size or path prefix.

This record authorizes planning and future PR slicing only. It does not approve
deletion, untracking, sanitization edits, history rewrite, or regeneration.

## Basis

The read-only inventory in
`docs/workflows/knx-runtime-and-bmad-output-inventory-2026-06-19.md` found:

- 83 tracked files under `_bmad/memory/knx/runtime/**`.
- About 0.40 MB of tracked runtime material.
- 14 files with local root, storage root, source root, or local user/path
  markers.
- `_bmad-output` references split across durable docs, BMAD config, and
  runtime code contracts.

The KNX memory index and profile still describe the 2026-06-01 local Windows
workspace boundary. Those records are useful historical context, but they are
not generic install defaults for Kendall_Nxt.

## Classification

| Runtime subtree | Files | Classification | Decision |
| --- | ---: | --- | --- |
| `module-validation/ksev/knx-source-evidence-validator/**` | 8 | `durable-source` | Keep tracked until the validator has a replacement source home. |
| `source-packets/**` | 6 | `durable-source` | Keep tracked for now; contains source packet examples and validation reports used by KNX evidence workflows. |
| `evaluation-packet/**` | 7 | `sanitize-and-promote` | Preserve useful conclusions in `docs/` before removing runtime copies. |
| `greenfield-implementation/**` | 36 | `sanitize-and-promote` | Preserve implementation decisions/runway conclusions in `docs/` before removing runtime copies. |
| `handoffs/**` | 2 | `sanitize-and-promote` | Convert still-useful handoff content to generic docs or retained historical evidence. |
| `runtime-inventory/**` | 4 | `sanitize-and-promote` | Replace local root values with sanitized evidence or move conclusions into docs. |
| `source-inventory/**` | 4 | `sanitize-and-promote` | Replace local source-root values with sanitized evidence or move conclusions into docs. |
| `report-audits/**` | 4 | `historical-evidence` | Keep until audited; likely can become a compact retained-evidence summary. |
| `commit-readiness/**` | 2 | `historical-evidence` | Keep until audited; contains local commit/staging context that should not be a generic runtime default. |
| `workflow-audits/**` | 1 | `historical-evidence` | Keep until audited; likely can be summarized. |
| `backlog/**` | 1 | `historical-evidence` | Keep until audited; likely can be summarized or superseded by tracked backlog docs. |
| `optional-source-evidence-pack/**` | 6 | `local-generated-output` | Review for templates/examples to preserve; generated reports should become local-only after replacements exist. |
| `optional-source-evidence-validator/**` | 2 | `local-generated-output` | Review reports for retained conclusions, then move generated report output local-only. |

## Cleanup Sequence

1. Preserve source-like validator material first.
   - Confirm whether `module-validation/ksev/knx-source-evidence-validator/**`
     should move to `.agents/skills/knx-source-evidence-validator/**`, a
     dedicated `tools/` path, or remain in KNX memory.
   - Do not remove validator scripts, tests, or module metadata until this is
     resolved.

2. Promote sanitized conclusions from historical runtime packets.
   - Start with `greenfield-implementation/**`, `handoffs/**`,
     `runtime-inventory/**`, and `source-inventory/**`.
   - Remove concrete local roots such as `C:/Users/...`, `.omnara/...`, and
     user-specific storage roots from any promoted generic docs.

3. Replace local-only `_bmad-output` citations in durable docs.
   - Keep `_bmad-output` as a runtime/config artifact root in config and
     supervisor code.
   - In stories and PRDs, replace citations with tracked docs when possible.
   - If no tracked source exists, label the citation as historical provenance
     instead of required checkout state.

4. Untrack generated local runtime output only after replacements exist.
   - Use `git rm --cached` when Bob needs local files preserved.
   - Use normal deletion only when the local files are no longer needed.
   - Add ignore rules only for subtrees proven local/generated and no longer
     tracked.

5. Run reference scans after each cleanup PR.
   - Check local root markers.
   - Check `_bmad-output` references.
   - Check links from `_bmad/memory/knx/index.md`.

## Stop Lines

- Do not delete or untrack any runtime subtree in the same PR that creates or
  updates this decision record.
- Do not remove `module-validation/ksev/knx-source-evidence-validator/**` or
  `source-packets/**` until their replacement source locations are reviewed.
- Do not rewrite Git history without a separate history-remediation approval.
- Do not remove `_bmad-output` references from runtime code or BMAD config where
  they define generated artifact roots.
- Do not claim the remote repo is generic while tracked concrete local roots
  remain unsanitized or unclassified.

## Verification For Future Cleanup PRs

Each future cleanup PR must report:

- exact files removed, moved, or sanitized;
- whether local files are preserved with `git rm --cached` or deleted;
- replacement tracked source or retained-evidence summary;
- rollback command;
- `rg` scan for local root markers in touched paths;
- `rg` scan for `_bmad-output` references in touched docs;
- relevant docs checks.

## Next PR

Create the first sanitized-promotion PR for
`_bmad/memory/knx/runtime/handoffs/**`, `runtime-inventory/**`, and
`source-inventory/**`. That PR should promote only the still-useful conclusions
into `docs/workflows/` or `docs/architecture/`, then propose exact follow-up
untracking targets. It should still avoid deleting the source runtime files
unless Bob separately approves the named file list.

## Promotion Artifact

The first sanitized-promotion artifact is:

- `docs/workflows/knx-runtime-promoted-evidence-2026-06-19.md`

It promotes generic conclusions from the first cleanup slice and names the
future cleanup candidates. It does not delete, untrack, sanitize in place,
regenerate, or rewrite runtime files.
