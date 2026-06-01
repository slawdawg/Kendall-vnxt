---
name: knx-execution-policy
description: Creates local-first execution policies. Use when the user says "create execution policy", "plan compute policy", or "set model provider policy".
---

# knx-execution-policy

## Overview

This workflow creates a KendallAI vNext execution policy that ranks mature tools, deterministic local processing, local compute/models, custom glue code, and external LLM providers before downstream workflows recommend how work should run. Act as a cost-control and safety governance planner. Produces an execution policy and exception records that future `knx` skills can enforce.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md` if it exists. If the profile is missing, route to `knx-profile-setup` unless the user explicitly provides enough setup context to draft a provisional policy.

Read an existing `{project-root}/_bmad/memory/knx/execution-policy.md` before changing it. If a requested change weakens local-first, mature-tool-first, custom-code-last, or external-provider-last rules, surface the conflict before writing.

## Inputs

Use:

- Install profile from `knx-profile-setup`.
- Storage and source-boundary assumptions known so far.
- Local compute/GPU/local model availability, even if marked `unknown`.
- External provider policy and approval requirements.
- Candidate capability or workflow, if the user wants a per-capability recommendation.
- Mature tool or platform candidates already known to the user or project.

Do not perform fresh external research in this workflow. If current tool/package/provider research is needed, create a handoff to `knx-mature-tool-review`.

## Execution Ladder

The default ladder is:

1. Mature workflow, platform capability, or maintained tool already inside the user's approved boundaries.
2. Deterministic local processing: parsing, filtering, indexing, validation, extraction, formatting, and fixtures.
3. Local compute/model path using VM resources, host GPU, or local model runtime when available and allowed.
4. Custom glue, import/export, validation, orchestration, or last-mile automation.
5. External LLM/GPT/provider use only when prior layers are insufficient and policy allows it.

Custom full workflow logic belongs in layer 4 only after layer 1 and layer 2 have been considered. External providers belong in layer 5 only after local and mature options are insufficient for the outcome.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/execution-policy.md`
- `{project-root}/_bmad/memory/knx/decisions/execution-policy-YYYY-MM-DD.md` when policy exceptions, external-provider use, or custom-code recommendations are accepted.
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state.

## Policy Contract

`execution-policy.md` must include:

- Policy status: `complete`, `provisional`, or `blocked`.
- Effective execution ladder.
- External provider rule.
- Custom-code rule.
- Local compute and GPU/local model assumptions.
- Mature-tool-first rule.
- Deterministic-first rule.
- Exception process.
- Required handoffs to `knx-mature-tool-review`.
- Open questions.
- Last updated date and source of each decision: user-specified, profile-derived, defaulted, or unresolved.

## Capability Recommendation Contract

When evaluating a proposed capability, produce:

- Capability name and intended outcome.
- Recommended execution layer.
- Prior layers considered.
- Why lower-cost or safer layers are sufficient or insufficient.
- Whether a mature-tool review is required.
- Whether custom code is allowed, blocked, or deferred.
- Whether external provider use is allowed, blocked, or requires approval.
- Evidence, assumptions, and open questions.

## Workflow

1. Orient from profile and any existing execution policy.
2. Build or update the execution ladder using profile decisions and safe defaults.
3. Resolve external-provider and custom-code rules conservatively when profile data is missing.
4. For each proposed capability, recommend the lowest safe layer that can plausibly satisfy the outcome.
5. Create a decision record for accepted exceptions or for recommendations that allow custom code or external providers.
6. Append a daily log note with policy status, changes, exceptions, and next workflow.
7. Recommend `knx-data-boundary-plan` after the base policy exists.

## Safety Rules

- Do not request, store, reveal, or test credentials or API keys.
- Do not call external LLM/model providers.
- Do not install tools, packages, drivers, services, browser extensions, model runtimes, or GPU software.
- Do not approve custom code or external provider use without a recorded reason and an explicit exception path.
- Do not treat local GPU or local model availability as confirmed unless the profile or user confirms it.
- Do not treat Git/GitHub as live deployment/runtime state.

## Next Workflow

If the base execution policy is ready, recommend `knx-data-boundary-plan`. If a capability needs current tool/package research before a recommendation can be trusted, recommend `knx-mature-tool-review` for that capability.
