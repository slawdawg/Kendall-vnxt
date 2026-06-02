# Greenfield Approved Path Inventory

Date: 2026-06-01

Status: PASS

Scope: metadata-only inventory for approved KNX greenfield implementation paths.

Command:

```powershell
git ls-files -- '.agents/skills/knx-*' '_bmad/config.yaml' '_bmad/module-help.csv' '_bmad/memory/knx/**' 'skills/reports/module-validation-*.md'
```

File count: 139

Path groups:
- knx-decision-record: 40
- knx-governance-memory: 10
- knx-runtime-evidence: 50
- knx-skill-source: 35
- module-validation-report: 2
- shared-module-registry: 2

Extension groups:
- .md: 101
- .json: 16
- .py: 13
- .csv: 4
- .yaml: 4
- .toml: 1

Boundary flags:

- Source content copied: false
- Source mutation performed: false
- External send performed: false
- GitHub or remote used: false
- Local model/GPU used: false

Notes:

- This inventory is path metadata only.
- It does not approve non-KNX product/app source inventory.
- It does not prove sensitive content is absent.
