# Source Mutation Posture Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: KNX workflows remain read/planning-only by default. Source mutation stays blocked unless a future explicit source-mutation decision approves a named workflow.

Named exception accepted:

- `scoped-source-mutation-knx-2026-06-01.md` approves scoped local source mutation for KNX module/governance records in the reopened greenfield implementation lane.

## Current Rule

Allowed:

- Read/planning operations over approved source roots.
- Metadata-only source inventory under approved storage.
- Local Git staging and local commits for scoped KNX governance and validator records, as separately approved.

Not allowed by default:

- Editing source files as an operational source-mutation workflow.
- Moving, deleting, overwriting, or rewriting source files as a workflow capability.
- Applying generated patches to source roots as part of KNX operational source intake.
- GitHub/remotes, pushes, PRs, releases, or remote mutation workflows.

## Future Approval Requirements

Any future source mutation workflow must record:

- named workflow or capability,
- exact target paths,
- source root and storage boundary fit,
- allowed file operations,
- rollback or recovery plan,
- test/validation plan,
- safety review result,
- explicit user approval for that mutation scope.

## Boundary Clarification

Local Git commits for scoped KNX governance and validator records are approved by `local-git-commit-2026-06-01.md`.

That approval does not authorize operational source mutation, broad repository edits, customer/production changes, remote pushes, GitHub workflows, or runtime assistant behavior.

The scoped KNX source-mutation exception authorizes only the target paths and operations listed in `scoped-source-mutation-knx-2026-06-01.md`.

## Decision Sources

- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- User approval on 2026-06-01.
