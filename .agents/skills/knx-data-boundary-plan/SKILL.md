---
name: knx-data-boundary-plan
description: Creates source and data boundary plans. Use when the user says "plan data boundaries", "create source boundary plan", or "define storage boundaries".
---

# knx-data-boundary-plan

## Overview

This workflow creates a KendallAI vNext data-boundary plan by classifying source data, allowed storage locations, allowed processing engines, forbidden destinations, and validation checks before source intake or operational workflows begin. Act as a privacy and deployment-boundary planner. Produces a manifest that future `knx` workflows can enforce.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md` and `{project-root}/_bmad/memory/knx/execution-policy.md` if present. If both are missing, route to `knx-profile-setup` first. If execution policy is missing, proceed only with a provisional data-boundary plan and recommend `knx-execution-policy` before downstream build decisions.

Read an existing `{project-root}/_bmad/memory/knx/data-boundaries.md` before changing it. If a requested change expands source access, storage destinations, processing engines, or external destinations, surface the risk before writing.

## Inputs

Use:

- Install profile storage mode, storage root status, allowed source roots, forbidden destinations, and approval policy.
- Execution policy for local-first, mature-tool-first, custom-code-last, and external-provider-last constraints.
- Source classes the user expects the assistant to handle.
- Candidate storage/sync options such as local folder, app data directory, OneDrive/sync provider, Microsoft 365-native surfaces, or another mature tool.
- Candidate processing engines such as deterministic local scripts, local indexes, local model runtime, host GPU, external provider, or mature platform feature.
- Deployment/runtime distinction between repo source control and live assistant state.

Do not infer permission to read or process a source class just because the source exists on disk.

## Boundary Model

Classify every source or output against four dimensions:

- Source class: what kind of information it is.
- Storage location: where durable or temporary copies may live.
- Processing engine: what may read or transform it.
- Destination: where output or derived content may be written or sent.

Each dimension must be marked allowed, forbidden, provisional, or unresolved.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/data-boundaries.md`
- `{project-root}/_bmad/memory/knx/decisions/data-boundary-YYYY-MM-DD.md` when a boundary expansion, storage choice, or external processing exception is accepted.
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state.

## Data Boundary Contract

`data-boundaries.md` must include:

- Boundary status: `complete`, `provisional`, or `blocked`.
- Storage mode and storage root status.
- Repo boundary: Git/GitHub is source/review, not live deployment/runtime state.
- Source class table.
- Allowed storage locations.
- Allowed processing engines.
- Forbidden destinations.
- External-provider rules from execution policy.
- Approval gates for boundary expansion.
- Validation checks or fixture requirements.
- Open questions.
- Last updated date and source of each decision: user-specified, profile-derived, execution-policy-derived, defaulted, or unresolved.

## Source Class Guidance

Start with conservative classes and let the user add detail:

- Public or synthetic sample data.
- User-authored planning documents.
- Operational assistant state.
- Email/calendar/meeting content.
- Attachments and exported files.
- Customer/project data.
- Credentials, secrets, tokens, account/security material.
- Generated drafts and review packages.
- Logs, caches, fixtures, indexes, and temporary files.

Credential, secret, token, MFA, account/security, customer-system, and production-system classes are forbidden unless a later approved policy explicitly defines a safe handling pattern. Do not define that safe handling pattern inside this workflow.

## Workflow

1. Orient from profile, execution policy, and any existing boundary plan.
2. Identify source classes and output classes relevant to the project.
3. Map allowed storage locations without assuming OneDrive or GitHub live deployment.
4. Map allowed processing engines according to the execution policy.
5. Mark forbidden destinations and unresolved boundaries explicitly.
6. Define validation checks or fixture requirements that can prove the boundary plan is being followed.
7. Create a decision record for accepted expansions, exceptions, or storage choices.
8. Append a daily log note with boundary status, changes, exceptions, and next workflow.
9. Recommend `knx-mature-tool-review` after the base boundary plan exists.

## Safety Rules

- Do not access source systems, customer systems, production systems, credentials, tokens, MFA prompts, account pickers, or account/security settings.
- Do not copy, move, archive, delete, sync, or upload source data.
- Do not create live deployment/runtime state.
- Do not treat OneDrive, GitHub, Microsoft 365, local model runtimes, or external providers as allowed until the boundary plan records them.
- Do not approve external-provider processing for sensitive source classes without a recorded policy exception and required approval path.
- Do not collapse repo source of truth and live assistant state into the same boundary without recording the risk.

## Next Workflow

If the base data-boundary plan is ready, recommend `knx-mature-tool-review`. If source classes, storage mode, or external-provider policy remain unresolved, leave the plan `provisional` and list the exact decisions needed before operational workflow design.
