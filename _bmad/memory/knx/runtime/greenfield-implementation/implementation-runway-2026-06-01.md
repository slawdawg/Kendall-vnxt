# KNX Greenfield Implementation Runway

Date: 2026-06-01

Status: ready for default-proceed local implementation

## Purpose

Define the next local implementation runway for the reopened greenfield lane: keep `knx` and `ksev` local-only, validated, separately packaged, and ready for continued scoped module work without additional user interaction unless a hard gate is reached.

## Implementation Lane

Active lane:

- `knx` governance core module.
- Standalone `ksev` source/evidence validator module.
- Local validation, report refreshes, routing records, handoffs, and scoped local commits.

Operating rule:

- Proceed by default under `decisions/default-proceed-local-workflow-2026-06-01.md`.
- Stop only for hard gates, genuine user-input requirements, or user pause.

## Current Module Assets

`knx` governance core:

- Setup skill: `.agents/skills/knx-setup`
- Setup manifest: `.agents/skills/knx-setup/assets/module.yaml`
- Validated skills:
  - `knx-agent-governance-coordinator`
  - `knx-data-boundary-plan`
  - `knx-execution-policy`
  - `knx-mature-tool-review`
  - `knx-module-strategy`
  - `knx-profile-setup`
  - `knx-safety-validation-review`
  - `knx-source-evidence-contract`

`ksev` standalone validator:

- Skill: `.agents/skills/knx-source-evidence-validator`
- Setup manifest: `.agents/skills/knx-source-evidence-validator/assets/module.yaml`
- Marketplace manifest: `.agents/skills/.claude-plugin/marketplace.json`
- Validator script: `.agents/skills/knx-source-evidence-validator/scripts/validate_source_evidence.py`
- Tests: `.agents/skills/knx-source-evidence-validator/tests/test_validate_source_evidence.py`

## Validation Commands

Run these after relevant local changes:

```powershell
python .\.agents\skills\bmad-module-builder\scripts\validate-module.py _bmad-output\test-artifacts\knx-module-validation-view
python .\.agents\skills\bmad-module-builder\scripts\validate-module.py _bmad\memory\knx\runtime\module-validation\ksev
python -m unittest discover -s .agents\skills\knx-source-evidence-validator\tests -p test_validate_source_evidence.py
python .agents\skills\knx-source-evidence-validator\scripts\validate_source_evidence.py
python .agents\skills\knx-source-evidence-validator\scripts\validate_source_evidence.py --source-packet-examples _bmad\memory\knx\runtime\source-packets\source-packet-examples-2026-06-01.json --output-dir _bmad\memory\knx\runtime\source-packets\validator-report
git diff --check
```

## Default-Proceed Next Steps

Proceed automatically with these local steps when useful:

1. Refresh module validation after scoped module asset changes.
2. Refresh `ksev` validator reports after fixture or source-packet-example changes.
3. Update KNX routing records after any lane status change.
4. Create local work traces and validation evidence for new local runtime artifacts.
5. Commit scoped local KNX governance, evidence, validation, packaging, and handoff changes.

## Hard Gates

Stop before:

- external sends,
- company sharing or evaluation access,
- GitHub/remotes,
- public distribution or publication,
- license or rights grants,
- source mutation outside scoped KNX governance/evidence/module records,
- writes outside approved KNX memory/runtime or approved local module/report paths,
- IDE/workspace configuration writes,
- customer/production/credential/account-security workflows,
- local model/GPU processing,
- runtime assistant behavior,
- destructive actions,
- risk score `9` waivers.

## Exclusions

This runway does not approve:

- source inventory generation beyond already materialized metadata evidence,
- operational source intake,
- source content copying,
- runtime assistant behavior,
- product deployment behavior,
- company-facing sharing,
- public release readiness.

## Current Readiness

Ready:

- Local `knx` governance core use.
- Local `ksev` validator use.
- Shared local `ksev` config/help registration.
- Local validation and report refreshes.
- Local scoped commits.
- Continued default-proceed governance/evidence/module handoff work.

Not ready:

- Public distribution.
- GitHub or remotes.
- Company sharing.
- Operational source intake.
- Runtime assistant behavior.

## Source References

- `_bmad/memory/knx/decisions/greenfield-implementation-lane-2026-06-01.md`
- `_bmad/memory/knx/decisions/default-proceed-local-workflow-2026-06-01.md`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/work-trace-ksev-registration-2026-06-01.md`
