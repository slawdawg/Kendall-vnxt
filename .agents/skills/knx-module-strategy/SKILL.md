---
name: knx-module-strategy
description: Plans KendallAI vNext module packaging. Use when the user says "plan module strategy", "decide module split", or "choose knx packaging".
---

# knx-module-strategy

## Overview

This workflow decides how KendallAI vNext capabilities should be packaged as one module, multiple modules, optional packs, ordinary project code, or a hybrid. Act as a module architect focused on installability, safety, maintainability, and avoiding monolithic overreach. Produces a module strategy report and build/package roadmap.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md`, `{project-root}/_bmad/memory/knx/execution-policy.md`, `{project-root}/_bmad/memory/knx/data-boundaries.md`, `{project-root}/_bmad/memory/knx/source-evidence-contract.md`, and `{project-root}/_bmad/memory/knx/tool-evaluation.md` if present. Read `skills/reports/kendallai-vnext-module-plan.md` when available.

If governance artifacts are missing, produce only a provisional strategy and name the missing inputs.

## Inputs

Use:

- Completed module plan or current skill list.
- Built `knx` workflow inventory.
- Install profile and external dependency posture.
- Execution policy and custom-code rules.
- Data-boundary and source/evidence contracts.
- Safety validation findings.
- Mature-tool review findings.
- User goals for installability and future operational packs.

Do not assume every candidate capability belongs in the initial module.

## Packaging Options

Compare:

- Single `knx` governance module.
- `knx` governance core plus optional packs.
- Multiple independent BMad modules.
- Ordinary project code plus a few BMad workflows.
- Hybrid with Builder modules for reusable governance and ordinary code for runtime product behavior.

The default recommendation remains governance core plus optional packs unless the inputs prove a different shape is safer or simpler.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/decisions/module-strategy-YYYY-MM-DD.md`
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state.

## Strategy Report Contract

The strategy report must include:

- Strategy status: `accepted`, `provisional`, `blocked`, or `deferred`.
- Capabilities reviewed.
- Packaging options considered.
- Recommended module shape.
- Initial module contents.
- Optional packs and split triggers.
- Capabilities that should remain ordinary project code.
- Capabilities deferred until profile/policy/boundary evidence exists.
- Build order.
- Setup/config implications.
- Safety validation prerequisites.
- Create Module readiness.
- Open questions.
- Last updated date and source of each major decision.

## Split Criteria

Split a capability into a separate module or pack when:

- It serves a different audience or install profile.
- It requires materially different dependencies or external integrations.
- It has different data boundaries or approval gates.
- It can provide independent value without the rest of `knx`.
- Keeping it inside `knx` would make setup, help, validation, or maintenance confusing.

Keep a capability inside the governance core when:

- Every downstream pack needs it.
- It defines policy, setup, boundaries, evidence, safety review, or module strategy.
- It has no separate runtime or data dependency.

Keep a capability as ordinary project code when:

- It is product runtime behavior rather than reusable BMad method.
- It depends on a specific deployment/storage/runtime choice.
- It would make the module less installable for other users.

## Workflow

1. Orient from module plan, built skill inventory, and governance artifacts.
2. Identify capabilities already built, planned, optional, deferred, or out of scope.
3. Compare packaging options against installability, dependencies, safety, data boundaries, maintenance, and user value.
4. Define the recommended module shape and optional pack split points.
5. Identify ordinary project-code boundaries.
6. Define the build/package roadmap and readiness criteria for `Create Module`.
7. Create or update the module strategy decision record.
8. Append a daily log note with strategy status, recommendation, and next action.
9. Recommend `knx-agent-governance-coordinator` if a coordinator is still useful after workflows exist; otherwise recommend `bmad-module-builder` Create Module.

## Safety Rules

- Do not package workflows that have unresolved safety blockers as release-ready.
- Do not hide optional dependencies inside the core module.
- Do not merge live deployment/runtime behavior into the governance module unless the strategy records why it is reusable and safe.
- Do not treat Bob-specific paths, OneDrive, GitHub, Microsoft 365, local GPU, local model runtimes, or external providers as hard requirements.
- Do not proceed to module scaffolding if the strategy is `blocked`.

## Next Workflow

If the strategy says a coordinator agent is useful, recommend building `knx-agent-governance-coordinator`. If no coordinator is needed and the selected workflows are built, recommend `bmad-module-builder` Create Module.
