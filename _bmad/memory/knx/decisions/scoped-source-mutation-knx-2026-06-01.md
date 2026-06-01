# Scoped Source Mutation Approval - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: approve scoped local source mutation for KNX module/governance records needed by the reopened greenfield implementation lane.

## Named Workflow

Workflow: KNX greenfield local module/governance implementation.

Purpose:

- Maintain and evolve local KNX governance workflows, module setup records, validation evidence, packaging metadata, and local handoffs.

## Approved Target Paths

Allowed target paths:

- `.agents/skills/knx-*`
- `_bmad/config.yaml`
- `_bmad/module-help.csv`
- `_bmad/memory/knx/**`
- `skills/reports/module-validation-*.md`

## Allowed Operations

Allowed:

- create,
- update,
- stage,
- commit locally,
- run deterministic local validation,
- refresh local validation reports.

Allowed only when scoped to the approved target paths and this workflow:

- edit module skill files,
- edit module setup assets,
- edit KNX governance memory,
- edit local validation evidence,
- edit shared local module config/help registration.

## Exclusions

Not approved:

- non-KNX application or product source edits,
- `.git/**` direct mutation,
- committing `_bmad/config.user.yaml`,
- GitHub/remotes,
- pushes, pulls, PRs, issues, actions, releases, packages, or publication,
- public distribution,
- external sends or provider calls,
- company sharing or evaluation access,
- credentials, customer, production, account/security, or administrative workflows,
- local model/GPU processing,
- runtime assistant behavior,
- destructive or ambiguous data-loss actions,
- risk score `9` waivers.

## Boundary Fit

Source root:

- `C:/Users/slaw_dawg/Kendall_Nxt`

Storage:

- KNX memory/runtime artifacts stay under `_bmad/memory/knx/**`.
- Shared module registration may update `_bmad/config.yaml` and `_bmad/module-help.csv`.

Git:

- Local Git staging and commits are allowed for scoped KNX records.
- GitHub/remotes remain blocked.

## Validation Plan

Run relevant checks before local commit:

- `git diff --check`
- targeted sensitive-pattern scan for changed tracked files
- YAML/JSON parse for changed config/evidence files
- BMad module validation for module packaging changes
- `ksev` unit tests and validator runs for validator changes

## Rollback Or Recovery Plan

Use local Git commit boundaries and scoped diffs for recovery.

Do not use destructive reset, broad deletion, or data-loss actions unless the user explicitly approves that separate action.

## Safety Review

Safety status: pass with concerns.

Concerns:

- Scoped source mutation can accidentally broaden if future edits are not checked against the approved path list.
- Shared config/help registration can affect module routing.

Mitigations:

- Validate changed paths before commit.
- Keep `_bmad/config.user.yaml` ignored and uncommitted.
- Continue to stop for hard gates outside this scope.

## Approval Basis

User approved Gate 1 on 2026-06-01.

## Relationship To Prior Decisions

This decision is a named exception to the default source mutation block in `source-mutation-posture-2026-06-01.md`.

It does not approve operational source intake, non-KNX product edits, remotes, public distribution, external sends, company sharing, runtime assistant behavior, customer/production access, or credential/account-security workflows.

## Decision Sources

- `_bmad/memory/knx/decisions/source-mutation-posture-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- `_bmad/memory/knx/decisions/default-proceed-local-workflow-2026-06-01.md`
- User approval on 2026-06-01.
