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

## Gate 2 Result

Gate: writes outside approved KNX memory/runtime or already-approved local module/report paths.

Status: accepted.

Decision record:

- `_bmad/memory/knx/decisions/write-boundary-knx-local-2026-06-01.md`

Summary:

- Allow scoped local writes to KNX module, shared module registry, KNX memory/runtime, and module-validation report paths.

## Gate 3 Result

Gate: source inventory materialization or new tooling.

Status: accepted.

Decision record:

- `_bmad/memory/knx/decisions/source-inventory-tooling-gate-2026-06-01.md`

Summary:

- Approved metadata-only source inventory materialization for approved KNX paths using mature local deterministic tools.
- Did not approve new custom tooling, packages, indexers, models, remotes, or external services.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.json`
- `_bmad/memory/knx/runtime/greenfield-implementation/inventory/greenfield-approved-path-inventory-2026-06-01.md`

## Gate 4 Result

Gate: public distribution readiness for `ksev`.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/ksev-public-distribution-readiness-gate-2026-06-01.md`

Summary:

- Approved local-only readiness checklist and evidence packet.
- Kept repository local/private, manifest local-only, and license `UNLICENSED`.
- Did not approve GitHub/remotes, publication, external sends, company sharing, public metadata activation, or license grants.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/distribution-readiness/ksev-public-distribution-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/distribution-readiness/ksev-public-distribution-readiness-2026-06-01.json`

## Gate 5 Result

Gate: GitHub/remotes.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/github-remote-readiness-gate-2026-06-01.md`

Summary:

- Approved local-only remote readiness planning.
- Confirmed no remote is configured.
- Did not approve or perform remote creation, push, pull, fetch, GitHub API calls, credentials, repository creation, PRs, issues, actions, releases, packages, or publication.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/github-remote-readiness-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/github-remote-readiness-2026-06-01.json`

## Gate 6 Result

Gate: company-facing sharing or evaluation access.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/company-evaluation-planning-gate-2026-06-01.md`

Summary:

- Reopened company-facing path for local planning only.
- Did not approve company sharing, external send, repository access, source archive, license grant, production-use permission, redistribution rights, or evaluation permission.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/company-evaluation-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/company-evaluation/company-evaluation-planning-2026-06-01.json`

## Gate 7 Result

Gate: IDE/workspace configuration.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/ide-workspace-planning-gate-2026-06-01.md`

Summary:

- Reopened IDE/workspace configuration path for local planning only.
- Kept IDE/workspace writes disabled by default.
- Did not approve `.vscode/`, `.idea/`, workspace, task, launch, button, shortcut, command, shell profile, startup automation, editor integration, runtime behavior, or external-send changes.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/ide-workspace-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/ide-workspace-planning-2026-06-01.json`

## Gate 8 Result

Gate: runtime assistant behavior.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/runtime-assistant-behavior-planning-gate-2026-06-01.md`

Summary:

- Reopened runtime assistant behavior path for local planning only.
- Defined runtime assistant behavior for KNX governance.
- Kept runtime behavior disabled.
- Did not approve runtime code, service, daemon, scheduled task, startup automation, live assistant state beyond approved records, external sends/providers, customer/production/credential access, or source mutation outside approved paths.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/runtime-assistant-behavior-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/runtime-assistant-behavior-planning-2026-06-01.json`

## Gate 9 Result

Gate: local model/GPU processing.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/local-model-gpu-processing-planning-gate-2026-06-01.md`

Summary:

- Reopened local model/GPU processing path for local planning only.
- Defined candidate future processing classes.
- Kept local model/GPU processing disabled.
- Did not approve model installs, GPU/runtime configuration, inference, source/customer/production processing, external providers, credential/account access, runtime assistant behavior, or source mutation outside approved paths.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/local-model-gpu-processing-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/local-model-gpu-processing-planning-2026-06-01.json`

## Gate 10 Result

Gate: customer/production/credential/account-security workflows.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/access-security-workflows-planning-gate-2026-06-01.md`

Summary:

- Reopened customer/production/credential/account-security workflow path for local planning only.
- Defined access/security workflow classes as blocked by default.
- Did not approve customer/production access, credential handling, auth/MFA/token work, account/security changes, external sends/providers, runtime assistant behavior, or source mutation outside approved paths.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/access-security/access-security-workflows-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/access-security/access-security-workflows-planning-2026-06-01.json`

## Gate 11 Result

Gate: destructive/data-loss actions or risk score `9` waivers.

Status: accepted for local planning only.

Decision record:

- `_bmad/memory/knx/decisions/destructive-risk-waiver-planning-gate-2026-06-01.md`

Summary:

- Reopened destructive/data-loss and risk score `9` waiver path for local planning only.
- Defined destructive/data-loss actions as blocked by default.
- Defined risk score `9` waiver requirements.
- Did not approve delete/move/overwrite/reset/cleanup/purge actions, destructive repository/runtime storage operations, risk score `9` waivers, customer/production/credential access, external sends/providers, or source mutation outside approved paths.

Materialized evidence:

- `_bmad/memory/knx/runtime/greenfield-implementation/destructive-risk/destructive-risk-waiver-planning-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/destructive-risk/destructive-risk-waiver-planning-2026-06-01.json`

## Next Action

Current hard-gate workthrough sequence is complete for local planning. Continue the local-only greenfield implementation lane by concrete capability, with all execution gates still blocked unless separately approved.
