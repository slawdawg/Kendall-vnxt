# Source Evidence Contract Decision - Local Source Inventory Evidence

Last updated: 2026-06-01

## Decision Status

Status: accepted with provisional contract status

## Capability Or Contract Reviewed

Update the KNX source/evidence contract for approved local read/planning source inventory.

## Decision

Accept source inventory evidence as a first-class source/evidence artifact type.

Approved scope:

- Source root: `C:/Users/slaw_dawg/Kendall_Nxt`
- Source operation: read/planning only
- Storage root for materialized inventory artifacts: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Mature inventory tools: `git ls-files`, `rg --files`, and PowerShell grouping

Not approved:

- source mutation
- GitHub/remotes
- external provider sends
- local model or GPU-backed classification
- credentials, account/security material, customer systems, or production systems
- generated artifacts outside the approved storage root

## Rationale

The profile and data-boundary plan now approve a local storage root and a broad local source root for read/planning. The mature-tool review accepted local deterministic inventory tools and deferred custom code. The source/evidence contract must therefore define how source inventory evidence is represented before inventory artifacts, source packets, or validators are built.

## Scope

This decision applies to KNX governance and planning artifacts only. It does not approve operational packs, source mutation, runtime deployment, external providers, customer/production access, or credential handling.

## Approval Basis

Approval basis:

- user-specified storage and source boundary on 2026-06-01
- data-boundary-derived approved local read/planning scope
- mature-tool-review-derived source inventory method

## Contract Changes Accepted

- Add `Source inventory evidence` to the artifact set.
- Add required fields for source inventory evidence.
- Require source inventory artifacts to link to validation evidence and the mature-tool decision that approved the inventory method.
- Require artifacts written outside `_bmad/memory/knx` to cite the approved storage root or later storage-boundary decision.
- Add negative fixture categories for source mutation without approval and inventory stored outside approved storage.
- Update data-boundary dependencies to reflect approved storage/source roots and per-use external-provider approval.
- Add validator run evidence bundle fields for optional-pack validator reports.
- Require validator-generated reports to link to work trace, validation evidence, and output metadata.
- Accept standalone synthetic validation evidence examples for referenced negative validation evidence IDs.

## Validator Evidence Update

Accepted for optional source/evidence pack prototype evidence:

- Validator reports must be linked to a work trace, validation evidence, and output metadata.
- Validator run evidence bundles must record whether source mutation, external sends, source inventory materialization, package installs, or runtime assistant behavior occurred.
- Referenced negative validation evidence IDs should be materialized as standalone synthetic validation evidence examples before a validator result is treated as clean `PASS`.

Evidence created:

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/evidence/validator-run-2026-06-01.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports/source-evidence-validation.json`
- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports/source-evidence-validation.md`

## Fit Against Data Boundary Plan

Fit: pass with concerns

The contract stays within approved local read/planning and approved local storage. Concerns remain because the approved source root is broad, local model/GPU status is unresolved, and source mutation remains approval-gated.

## Fit Against Execution Policy

Fit: pass

The contract relies on mature local tools and deterministic local processing. It does not require custom code, local model runtime, GPU, GitHub/remote workflows, or external providers.

## Risk Score

Risk score: 4

Risk basis: local inventory over a broad source root is useful and local-only, but it may reveal sensitive filenames or project structure if mishandled. The risk is controlled by local-only storage, no external sends, no source mutation, and required validation evidence.

Blocking status: nonblocking for local read/planning contract use; blocking for mutation, external sends, GitHub/remotes, credentials, customer/production access, local model/GPU classification, and writes outside approved storage.

## Open Questions

1. Should inventory artifacts be materialized now, or only when a consuming workflow needs them?
2. Which source classes should the first real source packets cover?
3. Who can approve risk score `9` waivers?

## Decision Sources

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`
- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
