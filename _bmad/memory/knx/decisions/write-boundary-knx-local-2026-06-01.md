# KNX Local Write Boundary Expansion

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: approve local writes outside KNX memory/runtime only for the KNX module, shared module registry, and validation report paths needed by the reopened greenfield implementation lane.

## Approved Write Paths

Allowed:

- `.agents/skills/knx-*`
- `_bmad/config.yaml`
- `_bmad/module-help.csv`
- `_bmad/memory/knx/**`
- `skills/reports/module-validation-*.md`

## Allowed Operations

Allowed when scoped to the approved paths:

- create files,
- update files,
- refresh local validation reports,
- stage and commit locally,
- run local deterministic validation.

## Exclusions

Not approved:

- non-KNX product or application source writes,
- `_bmad/config.user.yaml` commit inclusion,
- `.git/**` direct mutation,
- GitHub/remotes,
- external sends or providers,
- public distribution or publication,
- license or rights grants,
- company sharing or evaluation access,
- customer, production, credential, account/security, or administrative workflows,
- local model/GPU processing,
- runtime assistant behavior,
- destructive or ambiguous data-loss actions,
- risk score `9` waivers.

## Why This Was Gated

The prior default local write boundary centered on `_bmad/memory/knx/**` and approved KNX runtime storage. Greenfield module implementation also needs scoped local writes to installed skill folders, shared local config/help registry files, and validation report files.

## Validation Plan

Before local commit, run relevant checks:

- `git diff --check`
- targeted sensitive-pattern scan over changed tracked files
- YAML/JSON parse for changed config/evidence files
- BMad module validation for packaging changes
- `ksev` tests and validator runs for validator behavior or report changes

## Rollback Or Recovery Plan

Use local Git commit boundaries and scoped diffs. Do not use destructive reset, broad deletion, or ambiguous data-loss actions unless the user explicitly approves that separate action.

## Safety Review

Safety status: pass with concerns.

Concerns:

- Expanded write scope can drift if future edits are not checked against the path list.
- Shared module registry changes can affect routing.

Mitigations:

- Validate path scope before commit.
- Keep `_bmad/config.user.yaml` ignored and uncommitted.
- Stop for all remaining hard gates outside this decision.

## Approval Basis

User approved Gate 2 on 2026-06-01.

## Relationship To Prior Decisions

This decision complements `scoped-source-mutation-knx-2026-06-01.md`. Together they approve local KNX module/governance source edits and the exact write destinations needed for the local greenfield lane.

This does not approve operational source intake, non-KNX product edits, remotes, public distribution, external sends, company sharing, runtime assistant behavior, customer/production access, or credential/account-security workflows.

## Decision Sources

- `_bmad/memory/knx/decisions/scoped-source-mutation-knx-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
- User approval on 2026-06-01.
