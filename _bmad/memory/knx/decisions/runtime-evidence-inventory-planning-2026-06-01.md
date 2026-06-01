# Runtime Evidence Inventory Planning Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted for planning; materialization requires next approval

Decision: plan a separate metadata-only runtime evidence inventory for approved KNX runtime storage.

## Planning Scope

The planned runtime evidence inventory scope is limited to:

- `_bmad/memory/knx/runtime/commit-readiness/`
- `_bmad/memory/knx/runtime/handoffs/`
- `_bmad/memory/knx/runtime/module-validation/`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/`
- `_bmad/memory/knx/runtime/source-inventory/`
- `_bmad/memory/knx/runtime/workflow-audits/`

Excluded:

- file contents,
- checksums,
- paths outside `_bmad/memory/knx/runtime/`,
- GitHub/remotes,
- source mutation,
- external sends/providers,
- local model/GPU processing,
- credentials, customer, production, or account/security material.

## Job To Be Done

Create runtime evidence inventory that helps future KNX workflows answer:

- Which generated evidence artifacts exist under approved runtime storage?
- Which runtime evidence categories are present?
- What file-type mix exists in runtime evidence?
- Which evidence artifacts support governance, validation, handoff, and commit-readiness provenance?

## Accepted Tools

Use mature local tools:

- `rg --files --hidden _bmad/memory/knx/runtime`
- PowerShell grouping for extension and runtime-evidence-category summaries.

Do not use custom source indexers, checksums, content reads, local model/GPU processing, GitHub/remotes, external providers, or package installation.

## Planned Artifact Location

If materialized later, runtime evidence inventory must be written under:

- `_bmad/memory/knx/runtime/runtime-inventory/`

Planned files:

- `runtime-inventory-2026-06-01.json`
- `runtime-inventory-2026-06-01.md`
- `work-trace-runtime-inventory-2026-06-01.md`
- `validation-runtime-inventory-2026-06-01.json`

## Required Evidence Fields

The materialized runtime inventory evidence must include:

- `runtime_inventory_id`
- `storage_root`
- `storage_root_approval_basis`
- `inventory_scope`
- `allowed_operation`
- `inventory_tool`
- `inventory_command_or_check`
- `excluded_paths_or_patterns`
- `file_count`
- `top_file_groups`
- `runtime_evidence_groups`
- `generated_artifact_path`
- `forbidden_content_check`
- `boundary_check_result`
- `source_mutation_performed`
- `external_send_performed`
- `package_install_performed`
- `runtime_assistant_behavior_added`
- `checksums`
- `uncertainty`
- `provenance`
- link to a validation evidence record
- link to a work trace

## Safety Constraints

The planned inventory must:

- stay local,
- read only path metadata under the approved runtime storage root,
- avoid copying file contents,
- omit checksums,
- write only under approved KNX runtime storage,
- avoid source mutation,
- avoid GitHub/remotes,
- avoid external sends/providers,
- avoid local model/GPU processing,
- avoid credentials, tokens, MFA, account/security material, customer systems, and production systems.

## Relationship To Source Inventory

This is not a broader source inventory and does not expand the approved source-root inventory scope.

The first source inventory remains focused on governance/validator source and report artifacts. This runtime evidence inventory is a separate provenance artifact for generated evidence under approved runtime storage.

## Next Workflow

Recommended next workflow: `knx-safety-validation-review` for this planned runtime evidence inventory.

Do not materialize the runtime inventory until the safety review records pass or manageable concerns and the user approves proceeding with materialization.

## Decision Sources

- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.md`
- User approval for planning on 2026-06-01.
