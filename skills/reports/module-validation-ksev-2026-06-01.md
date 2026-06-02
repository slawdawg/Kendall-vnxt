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

- Unit tests: 24 passed.
- Fixture validation: PASS.
- Fixture count: 14.
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
- Required excluded-source-class enforcement for source packet example sets.
- Explicit synthetic-statement enforcement for fixture packs and fixture entries.
- Non-empty text enforcement for fixture pack and source packet example set identity/date fields.
- ISO date/datetime shape and calendar-value enforcement for fixture pack, fixture, artifact, and source packet example `created_at` fields.
- Full identity-field and non-empty text enforcement for fixture source packet artifacts.
- Controlled-vocabulary enforcement for fixture source packet artifacts.
- Controlled-field enforcement for source inventory fixture artifacts.
- Non-empty text enforcement for source inventory identity, command/check, path, and date fields.
- Required field and controlled-vocabulary enforcement for synthetic work traces, validation evidence, user-input-required records, and output metadata fixtures.
- Non-empty text and required-list enforcement for work trace artifacts.
- Non-empty string-list enforcement for fixture IDs, expected failed rules, work trace links/steps, validation references, user-input references/choices, and output metadata links.
- Non-empty text enforcement for validation evidence identity, command/check, reviewer, and date fields.
- Non-empty text and allowed-choice type enforcement for user-input-required artifacts.
- Storage-boundary-basis enforcement for output metadata fixtures.
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

- Unit tests: 27 passed.
- Fixture validation: PASS, 14 fixtures, 0 findings.
- Source packet example validation: PASS, 3 source packets, 0 findings.
- BMad module validation: pass, 0 findings.

Additional local hardening:

- Added non-empty text checks for source packet example identity and description fields.
- Added required excluded-source-class checks for source packet example sets.
- Added non-empty text checks for fixture pack and source packet example set identity/date fields.
- Added ISO date/datetime shape and calendar-value checks for fixture pack, fixture, artifact, and source packet example `created_at` fields.
- Added explicit synthetic-statement checks for fixture packs and fixture entries.
- Added full identity-field and non-empty text checks for fixture source packet artifacts.
- Added controlled-vocabulary checks for synthetic source packet fixture artifacts.
- Added controlled-field checks for source inventory fixture artifacts.
- Added non-empty text checks for source inventory identity, command/check, path, and date fields.
- Added required field and controlled-vocabulary checks for synthetic work trace artifacts.
- Added non-empty text and required-list checks for work trace artifacts.
- Added non-empty string-list checks for fixture IDs, expected failed rules, work trace links/steps, validation references, user-input references/choices, and output metadata links.
- Added required field and controlled-vocabulary checks for validation evidence artifacts.
- Added non-empty text checks for validation evidence identity, command/check, reviewer, and date fields.
- Added required field and controlled-vocabulary checks for user-input-required artifacts.
- Added non-empty text and allowed-choice type checks for user-input-required artifacts.
- Added required link and controlled-vocabulary checks for output metadata artifacts.
- Added storage-boundary-basis checks for output metadata artifacts.
- Added non-empty text checks for output metadata identity, trace, storage, and date fields.
