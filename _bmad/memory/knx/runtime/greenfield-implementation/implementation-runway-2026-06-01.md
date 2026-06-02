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

## Hard-Gate Planning Status

The current hard-gate workthrough sequence is complete for local planning:

- Gate 1: scoped KNX source mutation.
- Gate 2: local write boundary.
- Gate 3: source inventory/tooling.
- Gate 4: `ksev` public distribution readiness.
- Gate 5: GitHub/remotes.
- Gate 6: company-facing sharing or evaluation access.
- Gate 7: IDE/workspace configuration.
- Gate 8: runtime assistant behavior.
- Gate 9: local model/GPU processing.
- Gate 10: customer/production/credential/account-security workflows.
- Gate 11: destructive/data-loss actions or risk score `9` waivers.

These gates are complete for planning only. Execution gates remain blocked unless separately approved.

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

1. Refresh the scoped implementation evidence baseline after the completed hard-gate planning sequence.
2. Refresh module validation after scoped module asset changes.
3. Refresh `ksev` validator reports after fixture or source-packet-example changes.
4. Update KNX routing records after any lane status change.
5. Create local work traces and validation evidence for new local runtime artifacts.
6. Commit scoped local KNX governance, evidence, validation, packaging, and handoff changes.

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
- Completed Gates 1-11 local planning evidence.
- Local validation and report refreshes.
- Local scoped commits.
- Continued default-proceed governance/evidence/module handoff work.

Not ready:

- Public distribution.
- GitHub or remotes.
- Company sharing.
- Operational source intake.
- Runtime assistant behavior.

Next concrete local task:

- Refresh the scoped implementation evidence baseline described in `post-gate-continuation-2026-06-01.md`.

## Source References

- `_bmad/memory/knx/decisions/greenfield-implementation-lane-2026-06-01.md`
- `_bmad/memory/knx/decisions/default-proceed-local-workflow-2026-06-01.md`
- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/work-trace-ksev-registration-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/post-gate-continuation-2026-06-01.md`
