---
name: knx-safety-validation-review
description: Reviews workflows against safety contracts. Use when the user says "review safety validation", "check workflow safety", or "validate knx skill".
---

# knx-safety-validation-review

## Overview

This workflow reviews planned or built KendallAI vNext skills, workflows, modules, and operational packs against the install profile, execution policy, data-boundary plan, source/evidence contract, and safety invariants. Act as a conservative safety and provenance reviewer. Produces findings, blockers, and evidence coverage requirements before downstream build or packaging proceeds.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md`, `{project-root}/_bmad/memory/knx/execution-policy.md`, `{project-root}/_bmad/memory/knx/data-boundaries.md`, and `{project-root}/_bmad/memory/knx/source-evidence-contract.md` if present. If one is missing, treat the review as provisional and name the missing contract in the result.

If reviewing an existing skill folder, read its `SKILL.md` and `.decision-log.md` if present. If reviewing a planned skill, read the plan section or brief that defines it.

## Inputs

Use:

- Skill, workflow, module, or pack being reviewed.
- Install profile.
- Execution policy.
- Data-boundary plan.
- Source/evidence contract.
- Mature-tool review findings, if relevant.
- User-stated acceptance or release criteria.

Do not infer safety approval from silence. Missing governance artifacts are review findings, not permission to proceed.

## Review Scope

Review against:

- External send or customer-facing action risk.
- Source mutation risk.
- Credential, token, MFA, account/security, customer-system, or production-system risk.
- Forbidden storage, processing engine, or destination risk.
- External provider use and policy fit.
- Custom-code recommendation and mature-tool review evidence.
- Source packet, work trace, validation evidence, user-input-required, and fixture coverage.
- Repo/live-state boundary.
- Installability for users beyond the current operator.
- Operator-specific path, OneDrive, Microsoft 365, GitHub, GPU, local model, or external provider assumptions.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/decisions/safety-review-YYYY-MM-DD.md`
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state.

## Review Result Contract

The review result must include:

- Review status: `pass`, `concerns`, `blocked`, or `provisional`.
- Target reviewed.
- Governance artifacts read and missing.
- Findings grouped as blockers, concerns, and notes.
- Evidence coverage required.
- Data-boundary fit.
- Execution-policy fit.
- Source/evidence-contract fit.
- Required user decisions.
- Recommended fixes or next workflow.
- Residual risks.
- Last updated date and source of each major finding.

Use `blocked` when the target would send externally, mutate source systems, handle credentials/account/security, access customer/production systems, write to forbidden destinations, use external providers outside policy, or proceed with ambiguous data-loss risk.

## Workflow

1. Identify the target and review intent.
2. Read available governance contracts and the target artifact.
3. Classify missing contracts as provisional-review limitations.
4. Check for forbidden actions and stop conditions.
5. Check data-boundary, execution-policy, and source/evidence-contract fit.
6. Identify required evidence, fixtures, work traces, validation records, and user-input-required items.
7. Produce blockers, concerns, notes, recommended fixes, and next workflow.
8. Create or update the safety review decision record.
9. Append a daily log note with review status, blockers, and next action.
10. Recommend `knx-module-strategy` after governance workflows can pass safety review.

## Safety Rules

- Do not execute the reviewed workflow or skill.
- Do not access source systems, customer systems, production systems, credentials, tokens, MFA prompts, account pickers, or account/security settings.
- Do not install, update, remove, or execute tools.
- Do not send data to external providers or validate by calling external services.
- Do not downgrade blockers to concerns without a recorded user decision and an allowed policy path.
- Do not treat missing governance artifacts as a pass.

## Next Workflow

If the review passes or has manageable concerns, recommend `knx-module-strategy`. If the review is blocked, route to the specific missing or failing workflow: `knx-profile-setup`, `knx-execution-policy`, `knx-data-boundary-plan`, `knx-mature-tool-review`, or `knx-source-evidence-contract`.
