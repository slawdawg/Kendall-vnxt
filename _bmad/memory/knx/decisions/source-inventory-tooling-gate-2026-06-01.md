# Source Inventory And Tooling Gate - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: approve metadata-only source inventory materialization for approved KNX greenfield implementation paths using mature local deterministic tools. Do not approve new custom tooling, packages, indexers, models, remotes, or external services.

## Approved Inventory Scope

Allowed source paths:

- `.agents/skills/knx-*`
- `_bmad/config.yaml`
- `_bmad/module-help.csv`
- `_bmad/memory/knx/**`
- `skills/reports/module-validation-*.md`

Allowed operation:

- metadata-only read/planning inventory.

Allowed output location:

- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/`

## Approved Tools

Allowed:

- `git ls-files`
- `rg`
- PowerShell grouping and JSON/Markdown formatting
- existing BMad module validation
- existing `ksev` validator

Not approved:

- new custom source indexer,
- new package dependency,
- vector database,
- semantic classifier,
- local model/GPU processing,
- external provider,
- GitHub/remote workflow.

## Materialized Evidence

Created:

- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.md`

Inventory result:

- File count: 139.
- Source content copied: false.
- Source mutation performed: false.
- External send performed: false.
- GitHub or remote used: false.
- Local model/GPU used: false.

## Exclusions

Not approved:

- source content copying,
- operational source intake,
- non-KNX product/app source inventory,
- customer/production/credential/account-security material,
- external sends,
- GitHub/remotes,
- local model/GPU processing,
- runtime assistant behavior,
- writes outside approved paths.

## Validation Plan

Run:

- JSON parse for generated inventory JSON,
- `git diff --check`,
- targeted sensitive-pattern scan over changed tracked files,
- boundary review against approved path list.

## Safety Review

Safety status: pass with concerns.

Concerns:

- Path metadata can reveal local project structure.
- Metadata inventory does not prove sensitive content is absent.
- Future broader inventory could accidentally cross into non-KNX product/app source.

Mitigations:

- Keep artifacts local under approved KNX runtime storage.
- Use path metadata only.
- Require a later gate before non-KNX or operational source inventory.

## Approval Basis

User approved Gate 3 on 2026-06-01.

## Relationship To Prior Decisions

This decision uses the mature-tool recommendation in `mature-tool-source-inventory-2026-06-01.md`.

This decision does not approve custom tooling. Custom tooling remains deferred until a concrete capability, mature-tool review, source/evidence contract coverage, and safety validation exist.

## Decision Sources

- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- `_bmad/memory/knx/decisions/write-boundary-knx-local-2026-06-01.md`
- User approval on 2026-06-01.
