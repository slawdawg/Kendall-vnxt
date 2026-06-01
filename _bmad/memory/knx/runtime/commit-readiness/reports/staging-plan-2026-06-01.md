# Proposed Staging Plan - KNX Governance And Validator Work

Date: 2026-06-01

## Status

Status: proposal only.

No files were staged by this plan.

## Recommended Commit Shape

Recommended local commit shape, if approved later: one scoped KNX governance/validator commit.

Suggested commit message:

```text
Add KNX source evidence validator pack and governance records
```

Rationale: the changed files are tightly related. They harden KNX governance evidence, add the local-only optional `ksev` validator pack, and record validation/distribution decisions.

## Candidate Scope

### Governance Memory Updates

- `_bmad/memory/knx/index.md`
- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/tool-evaluation.md`
- `_bmad/memory/knx/daily/2026-06-01.md`

### Governance Decisions

- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`
- `_bmad/memory/knx/decisions/governance-coordinator-2026-06-01.md`
- `_bmad/memory/knx/decisions/module-strategy-2026-05-31.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/decisions/custom-code-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/mature-tool-source-evidence-validator-2026-06-01.md`
- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- `_bmad/memory/knx/decisions/source-evidence-contract-2026-06-01.md`
- `_bmad/memory/knx/decisions/validator-distribution-2026-06-01.md`
- `_bmad/memory/knx/decisions/validator-implementation-target-2026-06-01.md`

### Synthetic Fixture Pack

- `_bmad/memory/knx/fixtures/synthetic/README.md`
- `_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json`

### Optional Validator Pack

- `.agents/skills/.claude-plugin/marketplace.json`
- `.agents/skills/knx-source-evidence-validator/`

### Validation Reports

- `skills/reports/module-validation-knx-2026-06-01.md`
- `skills/reports/module-validation-ksev-2026-06-01.md`

### Runtime Evidence

- `_bmad/memory/knx/runtime/optional-source-evidence-pack/`
- `_bmad/memory/knx/runtime/optional-source-evidence-validator/`
- `_bmad/memory/knx/runtime/module-validation/ksev/`
- `_bmad/memory/knx/runtime/commit-readiness/reports/`
- `_bmad/memory/knx/runtime/handoffs/`

## Files To Avoid Adding Without Separate Review

No unrelated changed files were identified in the current `git status --short` output. Still, before staging, re-run status and confirm the scope has not changed.

Do not stage:

- credentials,
- local personal config,
- generated caches such as `__pycache__`,
- files outside the KNX governance/validator scope,
- any artifact that includes real customer, production, credential, token, MFA, account/security, or private source content.

## Pre-Commit Checks To Re-Run After Staging

If this staging plan is approved later, run:

```powershell
git diff --cached --check
python .agents\skills\bmad-module-builder\scripts\validate-module.py _bmad-output\test-artifacts\knx-module-validation-view
python .agents\skills\bmad-module-builder\scripts\validate-module.py _bmad\memory\knx\runtime\module-validation\ksev
python -m unittest discover -s .agents\skills\knx-source-evidence-validator\tests -p test_validate_source_evidence.py
python .agents\skills\knx-source-evidence-validator\scripts\validate_source_evidence.py
rg -n --pcre2 -- '-----BEGIN .*PRIVATE KEY-----|(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*[''"][^''"]{8,}' _bmad\memory\knx .agents\skills\.claude-plugin .agents\skills\knx-source-evidence-validator skills\reports\module-validation-ksev-2026-06-01.md skills\reports\module-validation-knx-2026-06-01.md
```

## Approval Gate

Staging and committing are not performed by this plan. User approval is required before staging files or creating a local commit.
