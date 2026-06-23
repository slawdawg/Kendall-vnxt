---
name: kom-setup
description: Configures Obsidian memory vault access. Use when the user says 'setup Obsidian memory' or 'configure Kendall memory vault'.
---

# kom-setup

## Overview

This skill configures the Kendall Obsidian Memory module for a local Linux host mirror of an Obsidian vault. Act as a module installer: capture the vault profile, approved read folders, excluded folders, backup location, and proposal queue, then write a reviewable `kom` configuration for the host runtime.

## Conventions

- Bare paths (e.g. `assets/module.yaml`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` at root level and the `kom` section. If config is missing, continue with the defaults in `assets/module.yaml`.

## Configuration

Collect or confirm these values:

- `profile`: `obsidian-sync-headless` for the preferred v1 profile, or `local-folder` for development.
- `vault_display_name`: user-facing vault name.
- `vault_root`: local Linux path to the synced vault mirror.
- `backup_root`: local Linux path for vault backups before write-back.
- `proposal_queue_folder`: `01 Dashboard Queue`.
- `allowed_read_folders`: approved vault folders Kendall may scan.
- `excluded_folders`: folders Kendall must not scan or summarize.
- `backup_retention`: daily, weekly, and monthly retention targets.

Keep cloud-drive folders, private-network storage, external provider calls, CRM mutation, customer-system access, credentials, tokens, MFA, and account/security workflows out of v1 setup. CRM/customer/contact updates may be drafted only as reviewable proposals.

## Write Config

Write or update the `kom` section in `{project-root}/_bmad/config.yaml`. Store shared defaults there. Store personal-only path overrides in `{project-root}/_bmad/config.user.yaml` if the install is for one operator or one machine.

Use this shape:

```yaml
kom:
  module_name: Kendall Obsidian Memory
  module_code: kom
  profile: obsidian-sync-headless
  vault_display_name: Kendall Memory
  vault_root: "{project-root}/.local/runtime/kom/vault"
  backup_root: "{project-root}/.local/runtime/kom/backups"
  proposal_queue_folder: "01 Dashboard Queue"
  allowed_read_folders:
    - "00 Inbox"
    - "02 Customers"
    - "03 Contacts"
    - "04 Projects"
    - "05 Decisions"
    - "06 Research"
    - "07 Operating Manual"
    - "08 Lessons"
  excluded_folders:
    - "01 Dashboard Queue"
    - "09 Archive"
    - "Private"
    - "Personal"
    - "Journal"
  backup_retention:
    daily: 14
    weekly: 8
    monthly: 6
```

## Validate

After writing config, run:

```bash
node {project-root}/scripts/knx-obsidian-memory.mjs validate --config {project-root}/_bmad/config.yaml
```

If the vault mirror does not exist yet, report setup as configured but not ready. Recommend `kom-validate` once the local mirror is present.
