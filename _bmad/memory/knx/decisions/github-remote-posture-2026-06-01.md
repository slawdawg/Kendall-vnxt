# GitHub And Remote Posture Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: keep GitHub, Git remotes, pushes, pulls, PRs, issues, actions, releases, deployments, and remote review workflows disabled by default.

## Current Rule

Allowed:

- Local Git status, diff, log, staging, and commits for scoped KNX governance and validator records.

Blocked unless separately approved:

- Git remotes.
- GitHub.
- Push or pull.
- PRs, issues, actions, releases, deployments.
- Remote review workflows.
- Treating Git or GitHub as runtime assistant state or deployment storage.

## Future Approval Requirements

Any future GitHub/remote workflow must record:

- named workflow or capability,
- remote URL or platform target,
- exact operation class,
- data that would leave the local machine,
- authentication/credential handling boundary,
- rollback or recovery plan,
- safety review,
- explicit user approval.

## Rationale

The current work is local governance and evidence hardening. Remote operations are unnecessary and would expand the boundary.

## Decision Sources

- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/decisions/local-git-commit-2026-06-01.md`
- User instruction to continue recommended decisions on 2026-06-01.
