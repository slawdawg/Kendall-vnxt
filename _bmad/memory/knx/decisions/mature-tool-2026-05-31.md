# Mature Tool Decision - KNX Governance Foundation

Last updated: 2026-05-31

## Decision Status

Status: accepted

Capability or workflow reviewed: KNX governance foundation memory, policy, boundary, tool-evaluation, and decision-record workflow.

## Research Questions

- Can current KNX governance work be handled safely with existing local workflow primitives?
- Which options fit the partial profile, provisional execution policy, and provisional data-boundary plan?
- What should be deferred until storage root, source roots, and provider policy are resolved?

## Options Considered

- Markdown memory files under `_bmad/memory/knx`.
- BMad/KNX skill workflows.
- Deterministic local file and section checks.
- Git/GitHub review workflow.
- Custom validation scripts.
- Local model runtimes.
- External providers.

## Fit Against Execution Policy

Accepted options stay in layer 1 and layer 2:

- Mature local workflow: BMad/KNX skills and Markdown memory.
- Deterministic local processing: shell/file checks.

Deferred or blocked options:

- Git/GitHub is deferred until a repo boundary exists.
- Custom validation scripts are deferred until a specific gap is approved.
- Local model runtimes are deferred until availability and boundaries are confirmed.
- External providers are blocked without explicit approval or recorded policy.

## Fit Against Data-Boundary Plan

Accepted options write only to `_bmad/memory/knx`, which is allowed for setup memory. They do not create live runtime state, access unapproved source roots, or send data externally.

## Cost Posture

No new paid service, account, install, or billing dependency.

## Security And Privacy Posture

Local-only and setup-memory-only. No credentials, account/security material, customer systems, production systems, or external sends.

## Maintenance And Dependency Posture

Low dependency and inspectable. Main risk is manual drift, mitigated by daily logs, decision records, and deterministic section checks.

## Licensing Or Usage Constraints

No new third-party license or service terms introduced.

## Recommendation

Accept Markdown memory files, BMad/KNX skill workflows, and deterministic local file checks as the mature governance foundation for now.

## Custom-Code Scope

None accepted in this mature-tool decision.

## Rollback Or Exit Path

Continue using Markdown as the source of record. If a later tool replaces it, require a recorded migration path, storage boundary, and rollback back to Markdown.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/tool-evaluation.md`

## Assumptions And Open Questions

Assumption: this review covers the governance foundation because no narrower capability was specified.

Open questions:

- Storage root remains unresolved.
- Source roots remain unresolved.
- Git/GitHub boundary remains unresolved.
- Local model runtime and GPU availability remain unresolved.

## Decision Sources

- Status: local review.
- Fit and constraints: profile-derived, execution-policy-derived, and data-boundary-derived.
- Cost/licensing claims: local review; no external research performed.
