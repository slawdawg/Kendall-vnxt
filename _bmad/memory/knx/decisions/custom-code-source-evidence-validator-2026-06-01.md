# Custom Code Decision - Optional Source Evidence Validator

Last updated: 2026-06-01

## Decision Status

Status: accepted for narrow deterministic local glue

## Capability Or Workflow Reviewed

Custom code for the future KNX optional source/evidence pack validator.

This decision supersedes the general 2026-05-31 custom-code deferral only for this narrow validator capability. It does not approve broader source indexing, source mutation, runtime assistant behavior, GitHub/remotes, external providers, local model/GPU processing, or governance-core implementation changes.

## Decision

Accept a small local Python standard-library validator for KNX source/evidence artifacts and synthetic fixture packs.

Implementation is not started by this decision. Before code is written, the target script location, input/output paths, validation result format, and safety review target should be named.

## Rationale

The governance core is scaffolded and validated, and the optional source/evidence pack is now the accepted next planning lane. The expanded synthetic fixture pack defines concrete expected failures that should be checked deterministically.

Generic local parse tools can confirm JSON shape, but KNX-specific rules require small glue:

- source mutation must be blocked without explicit approval,
- source inventory output must stay under the approved storage root,
- expected negative fixtures must include failed rules,
- controlled vocabulary values must match the source/evidence contract,
- risk score `9` must be blocking unless a waiver is linked.

## Approved Scope

Allowed custom code:

- Python standard-library script.
- Python standard-library tests.
- Deterministic checks over KNX governance files and synthetic fixture packs.
- Structured local findings.
- Optional local Markdown/JSON validation report under approved KNX memory or storage.

Allowed input classes:

- KNX governance memory files.
- Synthetic fixture files under `_bmad/memory/knx/fixtures/synthetic`.
- Future optional source/evidence pack artifacts under approved KNX storage.

Allowed output locations:

- `_bmad/memory/knx` for governance decision/report records.
- `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime` for approved generated artifacts.

## Not Approved

- Source mutation.
- Source inventory materialization before work trace and validation evidence are defined.
- Writes outside approved KNX memory or approved runtime storage.
- GitHub/remotes, PRs, issues, actions, releases, deployments, or remote CI.
- External providers or external sends.
- Local model/GPU processing.
- Credentials, tokens, MFA, account/security material, customer systems, or production systems.
- Runtime assistant behavior.
- Packaging validator implementation into governance core.
- Adding package dependencies without a later mature-tool review and user approval.

## Fit Against Execution Policy

Fit: pass with concerns

The accepted custom code is layer 4 glue after layers 1 and 2 were considered:

- mature local tools: PowerShell JSON parsing, Python stdlib, ripgrep,
- deterministic local processing: field checks, controlled vocabulary checks, path boundary checks.

Concerns remain because custom code introduces maintenance burden and must not expand into operational source handling.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The validator may read approved local governance and fixture files. It may write only to approved KNX memory or approved runtime storage. It must not mutate source roots, send externally, access sensitive classes, or write outside approved storage.

## Cost Posture

No new service, account, package, or install is approved.

## Security And Privacy Posture

The validator should operate on metadata and synthetic fixtures first. It must avoid copying real source content into output records unless a later source packet workflow explicitly approves the content and storage boundary.

## Maintenance And Dependency Posture

Keep the first implementation small, dependency-free, and removable. The Markdown contract and fixture pack remain the source of record.

## Licensing Or Usage Constraints

No new third-party license or service terms are introduced.

## Rollback Or Exit Path

If the validator proves too limited:

- stop using it,
- keep Markdown governance records and fixture packs as source of record,
- record a new mature-tool review for package-based schema validation,
- add dependencies only after user approval and safety review.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/decisions/mature-tool-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/custom-code-2026-05-31.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`

## Assumptions And Open Questions

Assumptions:

- The validator is optional source/evidence pack work, not governance-core work.
- The first implementation target is fixture/evidence validation, not source inventory generation.

Open questions:

1. What exact script path should be used for optional pack implementation?
2. Should validation evidence examples be materialized before validator code?
3. Should the validator emit JSON, Markdown, or both?

## Decision Sources

- Status: mature-tool-review-derived.
- Scope: module-strategy-derived and source/evidence-contract-derived.
- Restrictions: profile-derived, execution-policy-derived, and data-boundary-derived.
