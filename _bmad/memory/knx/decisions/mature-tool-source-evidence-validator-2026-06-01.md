# Mature Tool Decision - Optional Source Evidence Validator

Last updated: 2026-06-01

## Decision Status

Status: accepted with narrow custom glue; external/package dependencies deferred

## Capability Or Workflow Reviewed

Deterministic local validator implementation options for the future KNX optional source/evidence pack.

Reviewed target scope:

- Synthetic fixture pack validation.
- Source/evidence contract field checks.
- Source mutation approval checks.
- Approved-storage-root checks for materialized source inventory evidence.
- Local report output for validation evidence and work traces.

Not approved:

- Source mutation.
- GitHub/remotes.
- External provider sends.
- Local model or GPU-backed classification.
- Credentials, tokens, MFA, account/security material, customer systems, or production systems.
- Runtime assistant behavior.
- Writes outside approved storage.
- Packaging validators into governance core.

## Job To Be Done

Provide a local, repeatable way to check KNX source/evidence artifacts and fixture packs before optional source/evidence pack implementation proceeds.

The validator should make expected failures concrete, especially:

- source mutation requested without approval,
- source inventory stored outside the approved storage root,
- missing source links,
- external action requests,
- unsupported inference,
- forbidden destinations,
- missing required fields,
- invalid controlled vocabulary values.

## Research Questions

- Can existing mature local tools parse and check the current fixture pack and evidence records?
- Is a maintained schema package justified now?
- What custom code, if any, remains after mature local tools are considered?
- Which option best fits the local-first execution policy and approved data boundaries?
- What rollback path exists if the chosen approach is insufficient?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| PowerShell `ConvertFrom-Json` and path checks | Already available, deterministic, useful for quick parse and field presence checks | Awkward for richer rule sets and reusable reports | Accepted as a review/check aid |
| Python 3.12 standard library (`json`, `pathlib`, `argparse`, `dataclasses`, `re`, `unittest`) | Already available, deterministic, Windows-friendly, no new package/install/license surface | Requires small custom glue for KNX-specific rules | Accepted as primary validator implementation path |
| Existing BMad Module Builder validation pattern | Local deterministic precedent for module validation and reportable findings | Validates module structure, not KNX source/evidence artifacts | Accepted as implementation pattern only |
| `rg` secret-pattern and text scans | Already available, useful for forbidden-content heuristics and fixture safety scans | Not a complete secret detector or semantic validator | Accepted as supporting check |
| JSON Schema with `jsonschema` package | Mature option for formal schema validation | New dependency, no project manifest, does not cover cross-artifact policy rules by itself | Deferred |
| Pydantic | Mature Python validation library | New dependency and model layer; heavier than current artifact needs | Deferred |
| Node/Zod/Ajv | Mature for JS/TS schema validation | No Node project manifest for this pack; adds separate ecosystem dependency | Deferred |
| Local model or external LLM validation | Could classify complex source semantics later | Local model/GPU unresolved; external sends require per-use approval and safety review | Blocked for this capability |

## Fit Against Execution Policy

Fit: pass with concerns

Accepted approach uses layers 1 and 2:

- mature local tools already available in the workspace,
- deterministic local processing,
- no external provider,
- no local model/GPU dependency,
- no install or account requirement.

Narrow custom glue is justified only for KNX-specific cross-field and cross-artifact policy rules that generic parsers do not provide.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

The validator may read approved local KNX governance artifacts and synthetic fixture files. Any generated reports, validation evidence, or work traces must be written under `_bmad/memory/knx` or the approved storage root:

- `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`

The validator must not mutate source files, materialize source inventory outside approved storage, use GitHub/remotes, send externally, access credentials, or process customer/production/account-security material.

## Cost Posture

No new paid service, package, account, or install is required for the accepted path.

Deferred package options may introduce dependency maintenance and supply-chain review costs later.

## Security And Privacy Posture

Accepted approach stays local and reads only approved governance/fixture artifacts. It can reduce risk by making boundary failures explicit, but it does not authorize operational source intake or source mutation.

Secret-pattern scanning is a supporting heuristic only. It must not be represented as proof that all sensitive material is absent.

## Maintenance And Dependency Posture

Python stdlib and PowerShell are already present and stable enough for the current artifact formats. Keeping the first validator dependency-free improves installability for future users.

Package-based schema validation remains deferred until:

- field/rule complexity exceeds maintainable stdlib checks,
- a project dependency manifest or packaging decision exists,
- the package is reviewed for license, maintenance, Windows support, and install path,
- the user approves adding the dependency.

## Licensing Or Usage Constraints

The accepted path introduces no new third-party license or service terms.

No external package license was accepted in this review.

## Recommendation

Use a small Python stdlib validator as the primary implementation path for the optional source/evidence pack, supported by PowerShell parse checks and `rg` text scans where useful.

Initial validator checks should include:

- JSON parse and top-level fixture pack shape.
- Required fixture categories.
- Synthetic-only statement on every fixture.
- Expected validation result on every fixture.
- Expected failed rules on negative fixtures.
- Required fields by artifact type.
- Controlled vocabulary values.
- Generated artifact paths stay under approved storage when materialized.
- Source mutation is blocked unless a later approval decision is linked.
- External send flags remain false unless a matching approval exists.
- Risk score `9` is blocking unless a waiver decision is linked.

Do not add `jsonschema`, Pydantic, Zod, Ajv, local model, external provider, GitHub Action, or remote CI dependencies for the first validator.

## Custom-Code Scope

Status: accepted for narrow local glue only

Allowed:

- A small local Python script for deterministic validation.
- Tests using Python stdlib `unittest`.
- Local output of structured findings under approved KNX memory/storage.
- No network calls.
- No installs.
- No source mutation.

Not allowed:

- Source indexing beyond approved read/planning inventory evidence.
- Materializing inventory artifacts before work trace and validation evidence are defined.
- Writes outside approved KNX memory or approved storage root.
- External sends, GitHub/remotes, local model/GPU processing, customer/production access, credentials, account/security workflows, or runtime assistant behavior.

## Rollback Or Exit Path

If the stdlib validator becomes insufficient:

- Keep the fixture pack and Markdown contracts as the source of record.
- Record a new mature-tool review for a schema package.
- Add dependency and packaging decisions before adopting the package.
- Keep the validator optional and local so removing it does not make existing governance records unreadable.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`
- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/decisions/custom-code-2026-05-31.md`
- `skills/reports/module-validation-knx-2026-06-01.md`
- Local evidence:
  - Python 3.12.10 available.
  - Git 2.52.0 available for source/review only.
  - ripgrep 15.1.0 available.
  - No root project dependency manifest was found for this optional pack review.

## Assumptions And Open Questions

Assumptions:

- The first validator target is the synthetic fixture pack and KNX governance/evidence records, not arbitrary project source content.
- The optional source/evidence pack remains separate from governance core.
- Source inventory artifacts will not be materialized until a work trace and validation evidence record are defined.

Open questions:

1. Where should optional pack scripts live when implementation begins?
2. Should negative fixture validation evidence IDs become standalone validation evidence examples before validator implementation?
3. Which report format should the first validator produce: JSON only, Markdown only, or both?
4. Who can approve risk score `9` waivers?

## Decision Sources

- Status: local mature-tool review.
- Tool acceptance: local evidence and execution-policy-derived deterministic-first rule.
- Custom glue acceptance: source/evidence-contract-derived KNX-specific validation rules.
- Dependency deferral: no dependency manifest found, data-boundary-derived local-first posture, and custom-code-last policy.
- External provider block: profile-derived per-use approval policy and data-boundary-derived forbidden destinations.
