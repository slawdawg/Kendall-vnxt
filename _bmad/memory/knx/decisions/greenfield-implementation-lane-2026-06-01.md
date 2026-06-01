# KNX Greenfield Implementation Lane

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: reopen KNX greenfield migration implementation for the local-only installable governance core plus the standalone `ksev` source/evidence validator.

## Short Summary

The first implementation lane is explicit: keep the KNX governance core and `ksev` validator as separate local-only installable modules, validate their existing packaging evidence, and prepare only the local handoff needed for continued implementation.

This does not reopen parked or hard-gated paths.

## Capabilities Reviewed

- KNX governance core packaging and validation.
- `ksev` standalone optional validator packaging and validation.
- Local-only module manifests and setup assets.
- Existing source/evidence contract, data-boundary, execution-policy, mature-tool, and safety-review records.

## Packaging Options Considered

| Option | Fit | Decision |
| --- | --- | --- |
| Merge `ksev` into KNX governance core | Weak fit because validator behavior and assets are optional implementation behavior | Rejected |
| Keep KNX governance core plus standalone `ksev` optional pack | Best fit for installability, clear boundaries, and future optional-pack growth | Accepted |
| Start a new runtime/product module now | Premature because runtime assistant behavior, operational source intake, and deployment/storage choices remain unapproved | Deferred |
| Public distribution or GitHub/remote packaging | Not approved and requires separate owner, license, repository, release, and safety decisions | Blocked |

## Recommended Module Shape

Use two local-only installable modules:

- `knx`: governance core for setup, execution policy, data boundaries, mature-tool review, source/evidence contracts, safety validation, module strategy, and governance coordination.
- `ksev`: standalone optional source/evidence validator for dependency-free validation of synthetic fixture packs and metadata-only source packet examples.

The modules remain local-only and `UNLICENSED`.

## Initial Module Contents

`knx` core:

- `knx-profile-setup`
- `knx-execution-policy`
- `knx-data-boundary-plan`
- `knx-mature-tool-review`
- `knx-source-evidence-contract`
- `knx-safety-validation-review`
- `knx-module-strategy`
- `knx-agent-governance-coordinator`
- `knx-setup`

`ksev` optional pack:

- `knx-source-evidence-validator`
- dependency-free validator script
- validator unit tests
- standalone module assets
- local report output under approved KNX runtime storage

## Optional Packs And Split Triggers

Keep `ksev` separate from the KNX governance core because it has independent validation behavior, tests, reports, and optional-pack packaging value.

Create future optional packs only when a concrete consuming workflow exists and the pack has its own mature-tool review, source/evidence contract coverage, and safety validation.

## Ordinary Project Code Boundary

The following remain ordinary project or future product work, not part of this implementation lane:

- runtime assistant behavior,
- live deployment code,
- UI or IDE/workspace action wiring,
- customer, production, email/calendar, credential, or account/security integrations,
- source-specific importers,
- model-provider clients.

## Deferred Or Blocked Capabilities

Deferred or blocked unless separately approved:

- public distribution,
- GitHub/remotes,
- source mutation outside scoped KNX governance/evidence records,
- operational source intake,
- source inventory generation beyond already materialized metadata evidence,
- external providers or external sends,
- local model/GPU processing,
- customer/production access,
- credentials or account/security workflows,
- company sharing,
- license or rights grants.

## Build Order

1. Record this accepted implementation lane.
2. Revalidate existing `knx` and `ksev` module packaging evidence.
3. Refresh the current handoff and index to route implementation through this lane.
4. Use `bmad-module-builder` only for named packaging or validation changes.
5. Use `knx-safety-validation-review` before any boundary expansion, new optional pack, public release path, external send, source mutation, operational source intake, or expanded data access.

## Setup And Config Implications

No new setup fields are required for this lane.

The existing conservative config posture remains:

- local-first,
- approved local storage only,
- no external sends without per-use approval,
- no source mutation without explicit approval,
- no GitHub/remotes,
- no credentials, customer, production, account/security, local model/GPU, or destructive workflows.

## Safety Validation Prerequisites

Before treating any packaging change as complete:

- run the relevant module validation,
- run `ksev` unit tests when the validator changes,
- run fixture and source-packet-example validation when validator behavior changes,
- update the safety review if boundaries, manifests, optional-pack scope, or output locations change.

## Create Module Readiness

Readiness: accepted for local-only implementation continuation.

Evidence:

- `skills/reports/module-validation-knx-2026-06-01.md`: pass, 0 findings.
- `skills/reports/module-validation-ksev-2026-06-01.md`: pass, 0 findings.
- `ksev` unit tests: 14 passed in the latest validation report.
- Fixture validation: PASS, 14 fixtures, 0 findings in the latest validation report.
- Source packet example validation: PASS, 3 source packets, 0 findings in the latest validation report.

## Open Questions

No open questions block the local-only implementation lane.

Open questions for future gates:

1. Should public distribution ever be reopened?
2. Should a remote repository be approved later?
3. Should a company-facing evaluation path be reopened?
4. Which concrete optional pack or runtime capability, if any, should follow this lane?

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- `_bmad/memory/knx/decisions/pause-current-work-2026-06-01.md`
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`
- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/tool-evaluation.md`
