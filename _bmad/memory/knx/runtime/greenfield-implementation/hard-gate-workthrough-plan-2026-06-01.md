# KNX Hard-Gate Workthrough Plan

Date: 2026-06-01

Status: local planning artifact

## Purpose

Sequence the remaining hard-gated paths for the reopened greenfield lane so each gate can be handled deliberately without accidental scope expansion.

## Operating Rule

Proceed with local planning and evidence work by default.

Stop and request explicit approval before executing any hard-gated action.

## Recommended Gate Order

1. Source mutation for scoped KNX module/governance records.
2. Writes outside approved KNX memory/runtime or already-approved local module/report paths.
3. Source inventory materialization or new tooling.
4. Public distribution readiness for `ksev`.
5. GitHub/remotes.
6. Company-facing sharing or evaluation access.
7. IDE/workspace configuration.
8. Runtime assistant behavior.
9. Local model/GPU processing.
10. Customer/production/credential/account-security workflows.
11. Destructive/data-loss actions or risk score `9` waivers.

## Why This Order

- Source mutation and write-boundary decisions define what local implementation work can actually change.
- Tooling and source inventory decisions should happen before public distribution or operational paths.
- Public distribution and remotes affect ownership, license, metadata, and external destination risk.
- Company sharing depends on distribution, licensing, and artifact selection clarity.
- IDE, runtime behavior, model/GPU, customer/production, credentials, destructive actions, and risk waivers remain higher-risk and should stay late unless the user explicitly prioritizes them.

## Gate 1 Result

Gate: scoped source mutation for KNX module/governance records.

Status: accepted.

Decision record:

- `_bmad/memory/knx/decisions/scoped-source-mutation-knx-2026-06-01.md`

Summary:

- Allow local edits to approved KNX module/governance source records when needed for the greenfield lane.

Why gated:

- Current boundaries permit scoped KNX governance/evidence records but still treat broader source mutation as blocked by default.

Proposed scope:

- `.agents/skills/knx-*`
- `_bmad/config.yaml`
- `_bmad/module-help.csv`
- `_bmad/memory/knx/**`
- `skills/reports/module-validation-*.md`

Proposed exclusions:

- non-KNX application/product source,
- `.git/**`,
- `_bmad/config.user.yaml` commit inclusion,
- GitHub/remotes,
- public distribution,
- external sends,
- company sharing,
- credentials/customer/production/account-security workflows,
- runtime assistant behavior.

Validation plan:

- `git diff --check`
- targeted sensitive-pattern scan for changed tracked files
- YAML/JSON parse for changed config/evidence files
- BMad module validation for module packaging changes
- `ksev` unit tests and validator runs for validator changes

Rollback plan:

- use local Git commit boundaries and scoped diffs;
- do not use destructive reset unless the user explicitly requests it.

Local commit:

- included when validation passes and the change is scoped.

## Next Action

Proceed to Gate 2: writes outside approved KNX memory/runtime or already-approved local module/report paths.
