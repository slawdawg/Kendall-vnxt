# Module Validation - KNX Source Evidence Validator

Date: 2026-06-01

## Target

- Module code: `ksev`
- Module name: KNX Source Evidence Validator
- Skill: `.agents/skills/knx-source-evidence-validator`
- Validation view: `_bmad/memory/knx/runtime/module-validation/ksev`

## Result

Status: pass

Findings: 0

## Structural Validation

Command:

```powershell
python .agents\skills\bmad-module-builder\scripts\validate-module.py _bmad\memory\knx\runtime\module-validation\ksev
```

Result:

- Standalone module detected.
- Skill directory: `knx-source-evidence-validator`.
- Module code: `ksev`.
- CSV entries: 3.
- Structural findings: 0.

## Packaged Validator Verification

Commands:

```powershell
python -m unittest discover -s .agents\skills\knx-source-evidence-validator\tests -p test_validate_source_evidence.py
python .agents\skills\knx-source-evidence-validator\scripts\validate_source_evidence.py
python .agents\skills\knx-source-evidence-validator\scripts\validate_source_evidence.py --source-packet-examples _bmad\memory\knx\runtime\source-packets\source-packet-examples-2026-06-01.json --output-dir _bmad\memory\knx\runtime\source-packets\validator-report
```

Results:

- Unit tests: 84 passed.
- Fixture validation: PASS.
- Fixture count: 18.
- Source packet example validation: PASS.
- Source packet count: 3.
- Errors: 0.
- Warnings: 0.
- Findings: 0.

## Scope Confirmed

The standalone optional pack includes:

- Dependency-free synthetic source/evidence fixture validator.
- Metadata-only source packet example validator.
- Controlled-vocabulary enforcement for source packet example owner, approval basis, support level, processing boundary, storage boundary, operation, and uncertainty fields.
- Non-empty text enforcement for source packet example identity and description fields.
- Required `created_by` and controlled-status enforcement for source packet example sets.
- Required excluded-source-class enforcement for source packet example sets.
- Duplicate-ID enforcement for fixture artifact IDs and source packet example IDs.
- Explicit synthetic-statement enforcement for fixture packs and fixture entries.
- Required `created_by` and contract-reference enforcement for fixture packs.
- Required synthetic fixture-pack location enforcement.
- Non-empty text enforcement for fixture pack and source packet example set identity/date fields.
- ISO date/datetime shape and calendar-value enforcement for fixture pack, fixture, artifact, and source packet example `created_at` fields.
- Full identity-field and non-empty text enforcement for fixture source packet artifacts.
- Non-empty string-list enforcement for fixture source packet references and open questions.
- Controlled-vocabulary enforcement for fixture source packet artifacts.
- Controlled-field enforcement for source inventory fixture artifacts.
- Materialized source inventory validation-evidence and decision-record link enforcement.
- Non-empty text enforcement for source inventory identity, command/check, path, and date fields.
- Controlled-field, boundary flag, path, checksum-deferral, and group-shape enforcement for runtime evidence inventory fixture artifacts.
- Required field and controlled-vocabulary enforcement for synthetic work traces, validation evidence, user-input-required records, and output metadata fixtures.
- Required field, boundary flag, and shape enforcement for validator run evidence bundles.
- Source-reference enforcement for explicit decision records.
- Decision-record waiver ID enforcement for WAIVED validation evidence.
- Waived-blocking status enforcement for WAIVED validation evidence.
- WAIVED result enforcement for waived-blocking validation evidence.
- Failed-rule list enforcement for CONCERNS, FAIL, and WAIVED validation evidence.
- Blocking-status enforcement for FAIL validation evidence.
- Non-empty text and required-list enforcement for work trace artifacts.
- Non-empty string-list enforcement for fixture IDs, expected failed rules, work trace links/steps, validation references, user-input references/choices, and output metadata links.
- Materialized-reference enforcement for source packet IDs, validation evidence IDs, and output work trace IDs.
- Materialized-reference enforcement for validator run work trace, validation evidence, and output metadata links.
- Non-empty text enforcement for validation evidence identity, command/check, reviewer, and date fields.
- Non-empty text and allowed-choice type enforcement for user-input-required artifacts.
- Storage-boundary-basis enforcement for output metadata fixtures.
- Decision-record storage-boundary link enforcement for output metadata fixtures.
- Storage-boundary-basis and storage-location consistency enforcement for output metadata fixtures.
- Non-empty text enforcement for output metadata identity, trace, storage, and date fields.
- Validator tests.
- Standalone module registration assets.
- Local report writing under approved KNX runtime storage.

The pack does not include:

- Source inventory generation.
- Source content copying.
- Source mutation.
- Operational source intake.
- GitHub/remotes.
- External providers.
- Local model/GPU processing.
- Customer/production, credential, or account/security workflows.
- Runtime assistant behavior.
- Changes to the KNX governance core module.

## Distribution Metadata Cleanup

Status: local-only metadata recorded.

Updated manifest: `.agents/skills/.claude-plugin/marketplace.json`

Metadata values:

- owner: `KendallAI vNext local`
- author: `KendallAI vNext local`
- license: `UNLICENSED`
- homepage: `local-only`
- repository: `local-only`

Decision: the optional validator pack remains local installable packaging evidence, not a public distribution artifact. Public owner, repository, homepage, and license metadata require a later explicit distribution decision.

Post-cleanup verification:

- Marketplace JSON parse: pass.
- Packaged unit tests: 14 passed.
- Packaged validator result: PASS, 14 fixtures, 0 errors, 0 warnings.
- Source packet example validator result: PASS, 3 source packets, 0 errors, 0 warnings.
- BMad module validation: pass, 0 findings.
- `git diff --check`: pass.
- Targeted secret-pattern scan: no key material found; matches were policy mentions and validator detection-pattern source.

## Post-Gate Validator Hardening

Date: 2026-06-02

Change:

- Added controlled-vocabulary checks for metadata-only source packet examples.
- Added regression coverage for invalid source packet owner/provider, approval basis, source support level, processing boundary, storage boundary, source operation, and uncertainty values.

Verification:

- Unit tests: 84 passed.
- Fixture validation: PASS, 18 fixtures, 0 findings.
- Source packet example validation: PASS, 3 source packets, 0 findings.
- BMad module validation: pass, 0 findings.

Additional local hardening:

- Added non-empty text checks for source packet example identity and description fields.
- Added required `created_by` and controlled-status checks for source packet example sets.
- Added regression coverage for source packet example boundary flags that must remain false.
- Added regression coverage for malformed source packet example containers.
- Added regression coverage for missing inputs and non-object JSON roots.
- Added regression coverage for missing required source packet example fields.
- Added required excluded-source-class checks for source packet example sets.
- Added regression coverage for source packet operations that are valid vocabulary but not read-planning.
- Added regression coverage for malformed fixture pack and common fixture metadata shapes.
- Added regression coverage for source-mutation and external-action negative fixture contract rules.
- Added duplicate-ID checks for fixture artifact IDs and source packet example IDs.
- Added non-empty text checks for fixture pack and source packet example set identity/date fields.
- Added required `created_by` and contract-reference checks for fixture packs.
- Added ISO date/datetime shape and calendar-value checks for fixture pack, fixture, artifact, and source packet example `created_at` fields.
- Added explicit synthetic-statement checks for fixture packs and fixture entries.
- Added full identity-field and non-empty text checks for fixture source packet artifacts.
- Added non-empty string-list checks for fixture source packet references and open questions.
- Added controlled-vocabulary checks for synthetic source packet fixture artifacts.
- Added controlled-field checks for source inventory fixture artifacts.
- Added non-empty text checks for source inventory identity, command/check, path, and date fields.
- Added required field and controlled-vocabulary checks for synthetic work trace artifacts.
- Added non-empty text and required-list checks for work trace artifacts.
- Added non-empty string-list checks for fixture IDs, expected failed rules, work trace links/steps, validation references, user-input references/choices, and output metadata links.
- Added materialized-reference checks for source packet IDs, validation evidence IDs, and output work trace IDs.
- Added required field and controlled-vocabulary checks for validation evidence artifacts.
- Added non-empty text checks for validation evidence identity, command/check, reviewer, and date fields.
- Added required field and controlled-vocabulary checks for user-input-required artifacts.
- Added non-empty text and allowed-choice type checks for user-input-required artifacts.
- Added required link and controlled-vocabulary checks for output metadata artifacts.
- Added storage-boundary-basis checks for output metadata artifacts.
- Added non-empty text checks for output metadata identity, trace, storage, and date fields.
- Added non-empty string-list checks for metadata-only source packet example references and open questions.
- Added copied-content exclusions for fixture source packet artifacts and source packet example sets.
- Added package-install and runtime-assistant-behavior false-flag enforcement for metadata-only source packet examples.
- Added package-install and runtime-assistant-behavior false-flag enforcement for synthetic source inventory fixtures.
- Added required-field checks for source inventory command/check, forbidden-content, created-at, and created-by fields.
- Added non-empty string type checks for source inventory text fields.
- Added non-empty string type checks for work trace text fields.
- Added non-empty string type checks for validation evidence text fields.
- Added non-empty string type checks for user-input-required text fields.
- Added non-empty string type checks for output metadata text fields.
- Added non-empty string type checks for fixture source packet text fields.
- Added non-empty string type checks for source packet example text fields.
- Added non-empty string type checks for source packet example set text fields.
- Added non-empty string type checks for fixture pack text fields.
- Added string type checks for fixture-level synthetic-only statements.
- Added object-shape checks for entries inside fixture packs.
- Added approved KNX storage boundary checks for output metadata storage locations.
- Added non-empty string checks for validation waiver evidence fields.
- Added source-inventory `file_count` checks for nonnegative integers or the `unresolved` sentinel.
- Added optional source-inventory group/list shape checks.
- Added validation waiver metadata type checks.
- Added boolean rejection for numeric contract fields.
- Added output source-packet link checks outside the missing-source negative fixture.
- Added fixture artifact ID alignment checks against primary artifact IDs.
- Added valid output metadata fixture coverage and generated artifact reference checks.
- Added decision-record fixture coverage and contract validation checks.
- Added materialized decision-record reference checks.
- Added materialized superseded-decision reference checks.
- Added packet-level boundary flag checks for source packet examples.
- Added decision-record primary artifact ID alignment checks.
- Added source-reference ID resolution checks.
- Added PASS validation-evidence consistency checks.
- Added evidence-reference ID resolution checks.
- Added unsupported-output result status checks.
- Added high-risk decision approval-basis checks.
- Added user-input review-condition checks.
- Added work-trace blocking next-action checks.
- Added validation evidence target consistency checks.
- Added boundary validation target consistency checks.
- Added missing artifact-field regression coverage for work traces, validation evidence, decision records, and user-input-required records.
- Added missing-field regression coverage for fixture source packets and output metadata artifacts.
- Added validator run evidence bundle fixture coverage with required-field, boundary-flag, link, and output metadata shape checks.
- Added runtime evidence inventory fixture coverage with required-field, controlled-vocabulary, boundary-flag, checksum-deferral, path-boundary, group-shape, and list-shape checks.
- Added validator run evidence bundle materialized-reference checks for work trace, validation evidence, and output metadata links.
- Added materialized source inventory validation-evidence and mature-tool decision link checks.
- Added explicit decision source-reference checks.
- Added WAIVED validation evidence waiver ID and waiver decision reference checks.
- Added synthetic fixture-pack root location checks.
- Added output metadata decision-record storage-boundary link checks.
- Added output metadata storage-boundary basis and storage-location consistency checks.
- Added WAIVED validation evidence blocking-status consistency checks.
- Added failed-rule list checks for CONCERNS, FAIL, and WAIVED validation evidence.
- Added blocking-status checks for FAIL validation evidence.
- Added targeted source-support and boundary validation target regression coverage.
- Added WAIVED result checks for waived-blocking validation evidence.
