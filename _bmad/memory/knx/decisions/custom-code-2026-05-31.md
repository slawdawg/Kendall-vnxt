# Custom Code Decision - KNX Governance Foundation

Last updated: 2026-05-31

## Decision Status

Status: deferred

Capability or workflow reviewed: custom code for KNX governance foundation validation, storage, indexing, import/export, and automation.

## Research Questions

- Is custom code needed before the governance foundation can proceed?
- What mature or deterministic local options already cover the immediate need?
- What is the smallest custom-code role that might be justified later?

## Options Considered

- No custom code; use Markdown memory and deterministic local checks.
- Small local validators for contract sections and fixture boundaries.
- Source indexing or import/export scripts.
- GitHub automation.
- Local model orchestration.
- External-provider integration.

## Fit Against Execution Policy

The immediate governance foundation is satisfied by layer 1 and layer 2 options. Custom code belongs in layer 4 and is not justified yet without a concrete gap.

## Fit Against Data-Boundary Plan

Custom code that writes outside `_bmad/memory/knx`, mutates source roots, indexes unapproved data, or syncs to external destinations is not allowed under the current provisional boundary plan.

## Cost Posture

Deferring custom code avoids new development and maintenance cost.

## Security And Privacy Posture

Deferral avoids accidental expansion into unresolved source roots, storage roots, external sends, credentials, account/security material, customer systems, or production systems.

## Maintenance And Dependency Posture

Deferral keeps the governance foundation simple and inspectable until a specific automation need is proven.

## Licensing Or Usage Constraints

No new package or service license introduced.

## Recommendation

Defer custom code. Reconsider only for a specific capability after mature-tool and deterministic-local options are documented.

## Custom-Code Scope If Later Approved

Small local glue only:

- Markdown contract validation.
- Source packet validation.
- Synthetic fixture checks.
- Local import/export formatting inside approved storage.

## Rollback Or Exit Path

If custom code is later added, it must be optional and leave Markdown memory as the readable source of record. Removing the code must not make existing governance records unreadable.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/tool-evaluation.md`

## Assumptions And Open Questions

Assumption: no narrower custom-code capability was specified.

Open questions:

- Which operational capability, if any, needs custom automation first?
- What storage root and source roots will be approved?

## Decision Sources

- Status: local review.
- Deferral basis: execution-policy-derived and data-boundary-derived.
- Cost/licensing claims: local review; no external research performed.
