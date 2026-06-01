# Source Inventory Planning Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning; first-pass scope selected; materialization requires next approval

Decision: plan a narrow, local, read-only source inventory evidence pass for KNX governance and validator artifacts before any broader repository inventory or operational source intake.

## Planning Scope

The first planned inventory scope is limited to KNX governance and validator source artifacts:

- `_bmad/memory/knx/index.md`
- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/tool-evaluation.md`
- `_bmad/memory/knx/daily/`
- `_bmad/memory/knx/decisions/`
- `_bmad/memory/knx/fixtures/synthetic/`
- `.agents/skills/knx-source-evidence-validator/`
- `.agents/skills/.claude-plugin/marketplace.json`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`

Explicitly excluded from the first pass:

- `_bmad/memory/knx/runtime/`

Runtime evidence inventory is deferred to a separate later inventory artifact if needed.

The broader approved source root remains:

- `C:/Users/slaw_dawg/Kendall_Nxt`

The first planned inventory intentionally avoids treating the whole source root as the inventory target.

## Job To Be Done

Create source inventory evidence that helps future KNX workflows answer:

- Which KNX governance and validator artifacts exist?
- Which files are tracked by local Git?
- Which relevant files are visible under the scoped paths?
- What file-type mix exists in the scoped source set?
- Which generated inventory artifact paths are under the approved storage root?
- Which mature-tool decision approved the inventory method?

## Accepted Tools

Use mature local tools already accepted by `mature-tool-source-inventory-2026-06-01.md`:

- `git ls-files` for tracked scoped file inventory.
- `rg --files --hidden` with explicit exclusions for visible scoped file inventory.
- PowerShell grouping for extension/source-class summaries.

No custom source indexer, local model classifier, GPU processing, external provider, GitHub/remote workflow, or package install is approved.

## Planned Artifact Location

If materialized later, source inventory evidence must be written under:

- `_bmad/memory/knx/runtime/source-inventory/`

Planned files:

- `source-inventory-2026-06-01.json`
- `source-inventory-2026-06-01.md`
- `work-trace-source-inventory-2026-06-01.md`
- `validation-source-inventory-2026-06-01.json`

## Required Evidence Fields

The materialized inventory evidence must follow `source-evidence-contract.md` and include:

- `source_inventory_id`
- `source_root`
- `source_root_approval_basis`
- `inventory_scope`
- `allowed_operation`
- `inventory_tool`
- `inventory_command_or_check`
- `excluded_paths_or_patterns`
- `file_count`
- `top_file_groups`
- `generated_artifact_path`
- `forbidden_content_check`
- `boundary_check_result`
- `source_mutation_performed`
- `external_send_performed`
- `uncertainty`
- `provenance`
- link to `decisions/mature-tool-source-inventory-2026-06-01.md`
- link to a validation evidence record
- link to a work trace

## Safety Constraints

The planned inventory must:

- stay local,
- read only approved local files,
- use read/planning-only source operation,
- write only under the approved KNX runtime storage root,
- avoid copying file contents into inventory evidence,
- record filenames, paths, counts, extensions, and source classes only,
- avoid credentials, tokens, MFA, account/security material, customer systems, and production systems,
- avoid source mutation,
- avoid GitHub/remotes,
- avoid external sends/providers,
- avoid local model/GPU processing,
- avoid runtime assistant behavior.

## Open Questions

No open source-inventory planning questions remain for the first-pass metadata inventory.

## Next Workflow

Recommended next workflow: `knx-safety-validation-review` for this planned source inventory materialization.

Do not materialize the inventory until the user approves proceeding with materialization.

## User Scope Decision

Decision: exclude runtime evidence paths from the first source inventory pass.

Rationale:

- Keeps the first inventory focused on governance/validator source and report artifacts.
- Avoids mixing source records with generated runtime evidence.
- Leaves runtime evidence inventory available as a separate later artifact with its own validation record.

Source: user decision on 2026-06-01.

## Generated Report Grouping Decision

Decision: generated reports must be grouped separately from source records in future source inventories.

Rule:

- Files under `skills/reports/` and other generated validation/report output locations should use source class `generated-report`.
- Generated reports may be listed in the same inventory when they are part of the approved scope, but their counts must not be merged into governance source, validator source, fixture, or decision-record groups.
- Runtime evidence reports remain excluded from the first-pass inventory and require a separate runtime evidence inventory if needed.

Rationale:

- Separates source/planning records from evidence generated by validation workflows.
- Reduces ambiguity when comparing future inventory snapshots.
- Keeps reports useful for provenance without treating them as source records.

Source: user approval on 2026-06-01.

## Checksum Decision

Decision: defer checksums by default for current and near-term source inventories.

Rule:

- Source inventories remain metadata-only unless a later decision approves checksums for a concrete drift-detection need.
- Checksums are not included by default because computing them requires reading file contents.
- A future checksum pass must name the exact scope, storage path, drift-detection purpose, content-read boundary, and safety review result before materialization.

Rationale:

- The current planning need is satisfied by paths, counts, extensions, source classes, commands, provenance, work trace, and validation evidence.
- Avoids expanding from path metadata into content reads without a specific need.
- Keeps the first-pass inventory aligned with read/planning and no-file-content-copy boundaries.

Source: user approval on 2026-06-01.

## Decision Sources

- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
