---
name: kom-validate
description: Validates Obsidian memory vault boundaries. Use when the user says 'validate Obsidian memory' or 'check Kendall memory vault'.
---

# kom-validate

## Overview

This skill validates Kendall Obsidian Memory config and local vault behavior. Act as a boundary validator: confirm the vault mirror is local, allowed folders can be read, excluded folders are not scanned, backups stay local, and approved proposals can write only to the dashboard queue.

## Conventions

- Bare paths (e.g. `assets/module.yaml`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` at root level and the `kom` section. If `kom` is missing, recommend `kom-setup` before validation.

## Supported Runs

- `validate`: validate the configured local vault mirror.
- `synthetic`: create a temporary synthetic vault and run the full v1 loop.
- `propose`: create a local `MemoryProposal` JSON preview for a selected note.

## Workflow

For normal validation, run:

```bash
node {project-root}/scripts/knx-obsidian-memory.mjs validate --config {project-root}/_bmad/config.yaml
```

For synthetic validation, run:

```bash
node {project-root}/scripts/knx-obsidian-memory.mjs synthetic
```

Treat `PASS` as clean validation, `CONCERNS` as review-needed, and `FAIL` as blocking. Report the JSON summary, proposal id, write-back path, and any findings.

## Safety Rules

- Do not scan folders outside `allowed_read_folders`.
- Do not scan `excluded_folders`, even if a user asks for a broad vault scan.
- Do not write to source notes.
- Do not write outside `proposal_queue_folder/AI Drafts`.
- Do not update CRM, customer systems, contact records, calendars, email, files outside the vault, external services, credentials, or account/security settings.
- Do not call external providers or remote sync APIs as part of validation.

## Output

Validation evidence is JSON. If a report is needed, write it under configured local runtime storage or `_bmad-output/reports`; do not track runtime reports in Git.
