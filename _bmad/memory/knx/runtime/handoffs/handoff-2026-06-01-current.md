# KNX Current Handoff

Date: 2026-06-01

Status: local-only greenfield implementation lane open

## Current State

- KNX governance core is scaffolded and validated.
- Optional `ksev` source/evidence validator is scaffolded, validated, and local-only.
- Fast-lane local governance profile is accepted.
- Company-facing discussion path is parked.
- IDE one-click action path is closed.
- Local evaluation packet and discussion guide remain local-only and unshared.
- Metadata-only source packet examples are materialized and validated.
- `ksev` now validates both synthetic fixture packs and metadata-only source packet examples.
- User approval reopened the first greenfield implementation lane for the local-only installable KNX governance core plus standalone `ksev` validator.
- User approval established default-proceed local workflow: eligible local KNX work proceeds automatically until a hard gate or user pause.
- Greenfield implementation runway is materialized under `_bmad/memory/knx/runtime/greenfield-implementation/`.
- `ksev` is registered in shared local config/help registry.

## Latest Validation

- `ksev` unit tests: 14 passed.
- Synthetic fixture validation: PASS, 14 fixtures, 0 findings.
- Source packet example validation: PASS, 3 source packets, 0 findings.
- BMad module validation for `ksev`: pass, 0 findings.
- `ksev` local registration validation: PASS.

## Active Fast-Lane Scope

Allowed without per-step approval when all fast-lane conditions hold:

- local KNX governance records,
- local evidence records,
- local runtime packet/evidence artifacts,
- local deterministic validation,
- local scoped commits.

## Parked Or Hard-Gated

Parked:

- company-facing discussion,
- sharing-readiness,
- IDE one-click action.

Hard-gated:

- external sends,
- company sharing,
- GitHub/remotes,
- public distribution,
- license or rights grants,
- source mutation outside scoped KNX governance/evidence records,
- writes outside approved KNX memory/runtime storage,
- customer/production access,
- credential/account-security workflows,
- local model/GPU processing,
- destructive actions,
- risk score `9` waivers.

## Recommended Next Work

Proceed only inside the approved local-only greenfield implementation lane.

Route by concrete capability:

- use `bmad-module-builder` only for named packaging or validation changes,
- use `knx-source-evidence-contract` for new evidence/source packet contracts,
- use `knx-safety-validation-review` before any new optional pack or boundary expansion,
- use `knx-mature-tool-review` before new tooling or automation,
- use `bmad-module-builder` validation after module packaging changes.

For eligible local KNX governance, evidence, validation, packaging, handoff, and local commit work, proceed by default under `decisions/default-proceed-local-workflow-2026-06-01.md`.

Use `_bmad/memory/knx/runtime/greenfield-implementation/implementation-runway-2026-06-01.md` as the current local implementation runway.

Parked and hard-gated paths remain closed unless explicitly reopened.
