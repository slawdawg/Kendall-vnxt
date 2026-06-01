---
name: knx-source-evidence-contract
description: Defines source and evidence contracts. Use when the user says "define source packet contract", "create evidence contract", or "plan validation evidence".
---

# knx-source-evidence-contract

## Overview

This workflow defines KendallAI vNext source packet, work trace, validation evidence, user-input-required, decision record, and fixture contracts before operational workflows are built. Act as an evidence architecture planner. Produces contracts that make future assistant outputs traceable, testable, and safe across installs.

## On Activation

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root level and `knx` section). Use sensible defaults for anything not configured.

Read `{project-root}/_bmad/memory/knx/profile.md`, `{project-root}/_bmad/memory/knx/execution-policy.md`, `{project-root}/_bmad/memory/knx/data-boundaries.md`, and `{project-root}/_bmad/memory/knx/tool-evaluation.md` if present. If profile, execution policy, or data boundaries are missing, produce only a provisional contract and route back to the missing workflow before operational build work.

Read any existing `{project-root}/_bmad/memory/knx/source-evidence-contract.md` before changing it. If a requested change weakens traceability, source support, validation vocabulary, or stop-condition evidence, surface the conflict before writing.

## Inputs

Use:

- Install profile and storage mode.
- Execution policy and external-provider/custom-code rules.
- Data-boundary plan and source classes.
- Mature-tool review findings that affect artifacts or validation.
- Planned downstream workflows or packs.
- Prototype lessons: source packets, work traces, validation evidence, negative fixtures, generated review outputs, and user-input-required records.

Do not copy prototype schemas blindly. Preserve the concepts, but make fields installable and configurable for new users.

## Artifact Set

Define contracts for:

- Source packet: approved source material and source-support metadata.
- Work trace: human-readable provenance for actions taken.
- Validation evidence: machine-readable result and risk record.
- User-input-required item: explicit blocker or human decision request.
- Decision record: accepted/rejected/deferred governance decisions.
- Fixture pack: synthetic safe examples and negative fixtures.
- Output metadata: links between generated outputs, source packets, traces, and evidence.

## Outputs

Create or update:

- `{project-root}/_bmad/memory/knx/source-evidence-contract.md`
- `{project-root}/_bmad/memory/knx/fixtures/synthetic/README.md`
- `{project-root}/_bmad/memory/knx/decisions/source-evidence-contract-YYYY-MM-DD.md` when contract exceptions or major schema choices are accepted.
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`

If memory folders are absent, create only the minimal needed folders. Do not create live runtime/deployment state or real source packets.

## Contract Requirements

`source-evidence-contract.md` must include:

- Contract status: `complete`, `provisional`, or `blocked`.
- Artifact list and purpose.
- Required fields for each artifact.
- Controlled status vocabulary.
- Required source-support and uncertainty fields.
- Required links between source packets, outputs, work traces, validation evidence, and decisions.
- Validation result vocabulary: `PASS`, `CONCERNS`, `FAIL`, `WAIVED`.
- Risk scoring rule, including score `9` as blocking unless explicitly waived.
- Negative fixture categories.
- Fixture safety rules.
- Data-boundary dependencies.
- Execution-policy dependencies.
- Open questions.
- Last updated date and source of each major decision.

## Minimum Field Guidance

Every source packet should identify source class, source location or source description, approval/source support, permitted processing boundary, uncertainty, and downstream allowed use.

Every work trace should identify trigger, source packet IDs, generated artifact IDs, validation evidence IDs, steps taken, tools used, assumptions, uncertainty, residual risk, and next action.

Every validation evidence record should identify artifact under validation, result, failed rules if any, risk score, blocking status, evidence references, command/check run where applicable, and waiver information if any.

Every user-input-required item should identify the decision needed, why automation cannot proceed safely, source references, allowed choices if known, and blocked downstream work.

## Fixture Guidance

The first fixture pack should include:

- Minimal valid source packet.
- Minimal valid work trace.
- Minimal valid validation evidence.
- Minimal valid user-input-required item.
- Missing source negative fixture.
- External action request negative fixture.
- Low-confidence or unsupported inference negative fixture.
- Forbidden destination or data-boundary violation negative fixture.

Synthetic fixtures must not contain real customer data, credentials, tokens, secrets, or production/source-system content.

## Workflow

1. Orient from profile, execution policy, data boundaries, tool evaluations, and any existing source/evidence contract.
2. Identify downstream workflows that will consume the contract.
3. Define the artifact set and minimum fields.
4. Define link rules so outputs can be traced to source, work trace, validation evidence, and decisions.
5. Define validation vocabulary, risk scoring, and blocking rules.
6. Define safe synthetic fixture categories and negative fixture categories.
7. Create decision records for major schema choices or exceptions.
8. Append a daily log note with contract status, changes, unresolved questions, and next workflow.
9. Recommend `knx-safety-validation-review` after the base contract exists.

## Safety Rules

- Do not ingest real source material while defining the contract.
- Do not create source packets for customer, production, credential, token, MFA, or account/security material.
- Do not weaken source traceability, uncertainty labeling, or validation evidence requirements to simplify future workflows.
- Do not treat generated outputs as trusted unless they can link to source support, work trace, and validation evidence.
- Do not create validators or scripts in this workflow; define the contract first and leave implementation to a later build if needed.

## Next Workflow

If the base source/evidence contract is ready, recommend `knx-safety-validation-review`. If data boundaries or execution policy are unresolved, route back to the missing governance workflow before building operational workflows.
