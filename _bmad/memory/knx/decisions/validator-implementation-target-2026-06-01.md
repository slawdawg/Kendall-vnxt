# Validator Implementation Target - Optional Source Evidence Pack

Last updated: 2026-06-01

## Decision Status

Status: accepted for first implementation

## Target

Implement the first KNX optional source/evidence validator as local, dependency-free prototype tooling under the approved KNX runtime storage root.

## Script Path

Primary script:

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/scripts/validate_source_evidence.py`
- `.agents/skills/knx-source-evidence-validator/scripts/validate_source_evidence.py` for the packaged optional module

Tests:

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/tests/test_validate_source_evidence.py`
- `.agents/skills/knx-source-evidence-validator/tests/test_validate_source_evidence.py` for the packaged optional module

This location keeps the implementation out of governance-core skill packaging and inside the approved KNX runtime storage root.

The packaged optional module keeps the validator out of the KNX governance core while making it installable as a separate standalone module.

## Allowed Inputs

Default input:

- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`

Allowed input classes for this first implementation:

- Synthetic fixture files under `_bmad/memory/knx/fixtures/synthetic`.
- KNX governance/evidence metadata files under `_bmad/memory/knx` when used as references only.

Not allowed for this first implementation:

- Arbitrary project source content.
- Customer or production data.
- Credentials, tokens, MFA, or account/security material.
- Source mutation requests as executable actions.
- External-provider or GitHub/remote inputs.

## Allowed Outputs

Default output directory:

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/reports`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/reports` for packaged validator runs

Output formats:

- JSON findings report.
- Markdown findings report.

The validator may create report files only under the approved output directory or another path under the approved KNX runtime storage root.

## Validation Evidence Convention

For the first implementation, negative fixture validation evidence IDs remain expected-output IDs rather than standalone validation evidence examples.

The validator should report this as a concern when applicable, not as a blocker.

Standalone validation evidence examples can be materialized later after a separate source/evidence contract update or implementation decision.

## First Implementation Checks

Required checks:

- Fixture pack JSON parses.
- Top-level fixture pack fields exist.
- Required expanded fixture categories are present.
- Each fixture includes `fixture_type`, `synthetic_only_statement`, `artifact_ids`, `expected_validation_result`, `expected_failed_rules`, `forbidden_content_check`, `created_at`, and `artifact`.
- Expected validation result is one of `PASS`, `CONCERNS`, `FAIL`, or `WAIVED`.
- Negative fixtures have at least one expected failed rule.
- Fixture `forbidden_content_check` is `pass` unless explicitly testing that rule.
- Minimal valid source packet includes `source_operation: read-planning`.
- Source mutation negative fixture expects `FAIL` and uses `source_operation: mutation-requested`.
- Source inventory outside approved storage negative fixture expects `FAIL`, has `source_mutation_performed: false`, `external_send_performed: false`, and points outside the approved storage root.
- Materialized source inventory evidence, when not a negative fixture, must write under the approved storage root.
- Risk score `9`, when present, must be blocking unless a waiver is linked.

## Approved Storage Root

- `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`

## Boundaries

This implementation must not:

- mutate source files,
- materialize source inventory artifacts outside reports,
- install packages,
- use non-stdlib dependencies,
- call GitHub/remotes,
- send externally,
- use local model/GPU processing,
- access credentials/account-security/customer/production systems,
- add runtime assistant behavior,
- package itself into governance core.

## Packaged Optional Module

Packaging status: scaffolded and validated.

Packaged module:

- Module code: `ksev`
- Module name: KNX Source Evidence Validator
- Skill path: `.agents/skills/knx-source-evidence-validator`
- Validation report: `skills/reports/module-validation-ksev-2026-06-01.md`

Validation:

- Unit tests: 10 passed.
- Packaged validator result: PASS, 14 fixtures, 0 errors, 0 warnings.
- BMad module validation: pass, 0 findings.

## Decision Sources

- `_bmad/memory/knx/decisions/mature-tool-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/custom-code-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
