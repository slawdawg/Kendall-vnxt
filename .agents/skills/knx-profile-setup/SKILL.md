---
name: knx-profile-setup
description: Creates KendallAI vNext install profiles. Use when the user says "setup knx profile", "create install profile", or "configure KendallAI vNext".
---

# knx-profile-setup

## Overview

This workflow creates a safe KendallAI vNext install profile by capturing storage, repo, compute, provider, source-boundary, and approval-policy decisions before downstream workflows run. Act as a practical setup facilitator for an installable local-first assistant. Produces profile and memory scaffolding with conservative defaults when decisions are missing.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). If config is missing, let the user know `knx-setup` can configure the module after it exists. Use sensible defaults for anything not configured; prefer asking the user over assuming storage, provider, or source-access choices.

Check for an existing profile at `{project-root}/_bmad/memory/knx/profile.md`. If it exists, read it before changing it and treat the run as an update. If a requested change conflicts with the existing profile, surface the conflict before writing.

## Inputs

Capture or infer only when source evidence is clear:

- Primary user or owner label.
- Live state and generated-artifact storage mode.
- Storage root, if the chosen mode needs one.
- Git/GitHub repo remote for source and review work, if used.
- Local compute policy.
- External LLM/provider policy.
- GPU or local accelerator availability.
- Allowed source roots.
- Forbidden destinations.
- Approval policy for sends, source mutation, credentials, account/security, customer/production access, installs, and ambiguous data-loss risk.

## Defaults

Use these defaults when the user has not decided:

- `knx_storage_mode`: `local-folder`.
- `knx_storage_root`: unresolved; ask before writing live state outside module memory.
- `knx_local_compute_policy`: `local-first`.
- `knx_external_llm_policy`: `last-resort-with-approval-or-policy`.
- `knx_gpu_available`: `unknown`.
- `knx_forbidden_destinations`: external providers without policy, customer systems, production systems, credential stores, account/security settings.
- `knx_approval_policy`: no external send, no source mutation, no credentials, no account/security changes, no customer/production access, no destructive action, no ambiguous data-loss decision.

If setup remains incomplete, downstream behavior must default to no external providers, no source mutation, no sends, no credentials, no customer/production access, and no ambiguous storage writes.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/index.md`
- `{project-root}/_bmad/memory/knx/profile.md`
- `{project-root}/_bmad/memory/knx/execution-policy.md`
- `{project-root}/_bmad/memory/knx/data-boundaries.md`
- `{project-root}/_bmad/memory/knx/tool-evaluation.md`
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`
- `{project-root}/_bmad/memory/knx/decisions/`
- `{project-root}/_bmad/memory/knx/fixtures/synthetic/`

Do not create live deployment/runtime state during setup unless the user explicitly chooses the storage mode and root.

## Profile Contract

`profile.md` must include:

- Setup status: `complete`, `partial`, or `blocked`.
- User label.
- Storage mode and storage root status.
- Repo/GitHub source-control boundary.
- Local compute and GPU/local model status.
- External provider policy.
- Allowed source roots.
- Forbidden destinations.
- Approval policy.
- Open setup questions.
- Last updated date and source of each decision: user-specified, detected, defaulted, or unresolved.

## Workflow

1. Orient from any existing profile and the current project config.
2. Ask only for missing decisions that change safety, storage, external-provider use, or installability.
3. Create the memory folder scaffold before writing profile content.
4. Write or update `profile.md` using the profile contract.
5. Initialize companion memory files with short placeholders if absent; never overwrite user-edited content without surfacing the change.
6. Append a dated entry to the daily log summarizing decisions, defaults, unresolved questions, and any blocked items.
7. Summarize the resulting setup status and next workflow recommendation.

## Safety Rules

- Do not access credentials, tokens, MFA prompts, account pickers, or account/security settings.
- Do not send messages, modify source systems, create calendar holds, or create external resources.
- Do not assume OneDrive, GitHub, external LLM providers, host GPU access, or Microsoft 365 availability.
- Do not write inside a Git repo as live deployment state unless the user explicitly chooses that path and the profile records the risk.
- Do not treat operator-specific paths or preferences as defaults for other users.

## Next Workflow

If setup status is `complete` or sufficient for planning, recommend `knx-execution-policy`. If storage, source roots, or external-provider policy are unresolved and block safe planning, leave setup status `partial` and list the exact questions.
