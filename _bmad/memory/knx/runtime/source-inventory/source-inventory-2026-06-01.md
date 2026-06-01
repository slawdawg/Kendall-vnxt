# Source Inventory Evidence - KNX First Pass

Date: 2026-06-01

## Result

Status: PASS

Inventory ID: `knx-source-inventory-2026-06-01-001`

## Scope

This inventory covers KNX governance and optional validator source/report artifacts only.

Included:

- KNX governance records under `_bmad/memory/knx`.
- KNX decision records under `_bmad/memory/knx/decisions`.
- Synthetic fixtures under `_bmad/memory/knx/fixtures/synthetic`.
- Optional `ksev` validator source under `.agents/skills/knx-source-evidence-validator`.
- Local module marketplace manifest `.agents/skills/.claude-plugin/marketplace.json`.
- KNX and `ksev` module validation reports under `skills/reports`.

Excluded:

- `_bmad/memory/knx/runtime/`
- `_bmad-output/`
- `.git/`

Runtime evidence inventory is deferred to a separate later artifact if needed.

## Counts

- Tracked scoped files: 39.
- Visible scoped files: 39.

## Extension Summary

| Extension | Count |
| --- | ---: |
| `.md` | 31 |
| `.py` | 4 |
| `.json` | 2 |
| `.csv` | 1 |
| `.yaml` | 1 |

## Source Class Summary

| Source class | Count |
| --- | ---: |
| daily-log | 2 |
| decision-record | 18 |
| generated-report | 2 |
| governance-core-record | 6 |
| module-manifest | 1 |
| synthetic-fixture | 2 |
| validator-skill | 8 |

## Commands

Tracked file inventory:

```powershell
git ls-files -- _bmad/memory/knx/index.md _bmad/memory/knx/profile.md _bmad/memory/knx/execution-policy.md _bmad/memory/knx/data-boundaries.md _bmad/memory/knx/source-evidence-contract.md _bmad/memory/knx/tool-evaluation.md _bmad/memory/knx/daily _bmad/memory/knx/decisions _bmad/memory/knx/fixtures/synthetic .agents/skills/knx-source-evidence-validator .agents/skills/.claude-plugin/marketplace.json skills/reports/module-validation-knx-2026-06-01.md skills/reports/module-validation-ksev-2026-06-01.md
```

Visible file inventory:

```powershell
rg --files --hidden _bmad/memory/knx .agents/skills/knx-source-evidence-validator .agents/skills/.claude-plugin skills/reports -g '!_bmad/memory/knx/runtime/**' -g '!_bmad-output/**' -g '!.git/**'
```

Grouping:

```powershell
PowerShell extension and source-class grouping over git ls-files scoped output
```

## Boundary Flags

- Source mutation performed: false.
- External send performed: false.
- Package install performed: false.
- Runtime assistant behavior added: false.
- File contents copied: false.

## Links

- JSON inventory: `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`
- Work trace: `_bmad/memory/knx/runtime/source-inventory/work-trace-source-inventory-2026-06-01.md`
- Validation evidence: `_bmad/memory/knx/runtime/source-inventory/validation-source-inventory-2026-06-01.json`
- Mature-tool decision: `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- Planning decision: `_bmad/memory/knx/decisions/source-inventory-planning-2026-06-01.md`

## Residual Risk

This inventory records path metadata and counts only. It does not inspect file contents and does not prove sensitive content is absent.
