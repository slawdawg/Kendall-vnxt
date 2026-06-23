---
name: kom-safety-review
description: Reviews Obsidian memory workflow safety. Use when the user says 'review Obsidian memory safety' or 'check Kendall memory safety'.
---

# kom-safety-review

## Overview

This skill reviews Kendall Obsidian Memory workflows, config, and runtime changes against KNX boundaries. Act as a safety and provenance reviewer: block source mutation, external sends, credential access, customer-system writes, and broad vault ingestion unless the approved module policy explicitly permits them.

## Conventions

- Bare paths (e.g. `assets/module.yaml`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` at root level and the `kom` section. Read KNX governance records if present:

- `{project-root}/_bmad/memory/knx/profile.md`
- `{project-root}/_bmad/memory/knx/execution-policy.md`
- `{project-root}/_bmad/memory/knx/data-boundaries.md`
- `{project-root}/_bmad/memory/knx/source-evidence-contract.md`

If a governance record is missing, mark the review provisional and name the missing record.

## Review Scope

Review:

- Configured vault profile and local mirror path.
- Allowed and excluded folder boundaries.
- Backup destination and retention intent.
- `MemoryProposal` fields, evidence references, and dashboard review status.
- AI draft write-back path and frontmatter.
- Any future connector, CRM, contact, email, calendar, remote sync, or customer-system integration.

## Pass Conditions

The target may pass when it:

- Reads only approved folders.
- Treats `01 Dashboard Queue`, archive, personal, private, and journal folders as excluded from scans.
- Persists proposed memory changes as reviewable proposals before write-back.
- Writes only approved AI drafts to `01 Dashboard Queue/AI Drafts`.
- Creates a local backup before approved write-back.
- Stores metadata and links instead of raw provider payloads, secrets, or unnecessary source copies.

## Blockers

Block the target if it would mutate source notes, update CRM/contact/customer systems, send externally, access credentials or account/security flows, scan excluded folders, write outside the queue, use a remote provider without explicit policy, or make broad vault contents available without a configured allowlist.

## Output

Return a concise review result with status `pass`, `concerns`, `blocked`, or `provisional`; findings; evidence required; missing governance records; and required fixes. Keep generated review notes in local BMAD output unless the decision is rewritten as source-owned policy.
