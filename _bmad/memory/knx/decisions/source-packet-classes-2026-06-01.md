# Source Packet Class Decision - KNX First Real Packets

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: the first real KNX source packets should cover approved local planning and evidence classes only.

## Approved First Source Packet Classes

Use these classes first, in order:

1. `user-authored-planning-document`
   - Covers KNX memory records, decisions, contracts, policies, and daily logs.
   - Examples: `_bmad/memory/knx/profile.md`, `_bmad/memory/knx/source-evidence-contract.md`, `_bmad/memory/knx/decisions/*.md`.
2. `public-or-synthetic-sample-data`
   - Covers synthetic fixtures and safe examples only.
   - Examples: `_bmad/memory/knx/fixtures/synthetic/README.md`, `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`.
3. `generated-report`
   - Covers generated validation/report outputs that support provenance.
   - Examples: `skills/reports/module-validation-knx-2026-06-01.md`, `skills/reports/module-validation-ksev-2026-06-01.md`, source inventory summary reports under approved runtime storage.

## Deferred Classes

Deferred until later explicit approval and safety review:

- Runtime evidence inventory as a source packet class.
- Exported files or attachments.
- Customer/project data.
- Production systems.
- Credentials, tokens, MFA, account/security material.
- GitHub/remotes.
- External providers.
- Local model/GPU-derived outputs.
- Source mutation records.
- Operational source intake.

## Boundary Rules

First source packets must:

- stay local,
- use approved source root `C:/Users/slaw_dawg/Kendall_Nxt`,
- remain read/planning-only,
- avoid copying file contents unless a packet-specific decision approves an excerpt or summary,
- avoid customer, production, credential, token, MFA, account/security, and private source content,
- avoid external sends/providers,
- avoid GitHub/remotes,
- avoid local model/GPU processing,
- avoid source mutation,
- write generated packet/evidence artifacts only under approved KNX runtime storage or approved KNX memory paths.

## Rationale

These classes are already represented in the first source inventory evidence and fit the current data-boundary plan. They provide enough real local provenance for downstream planning without expanding into operational source intake or sensitive data classes.

## Next Workflow

Recommended next workflow: update `source-evidence-contract.md`, then run `knx-safety-validation-review` for the source-packet class decision.

## Decision Sources

- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`
- User approval on 2026-06-01.
