# GitHub Remote Readiness Gate - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted for local planning only

Decision: approve local-only GitHub/remote readiness planning. Keep GitHub/remotes disabled; do not create remotes, push, pull, fetch, call GitHub APIs, create repositories, configure credentials, or publish.

## Current Remote State

`git remote -v` output:

```text
none
```

No remote is configured.

## Approved Scope

Allowed:

- local readiness checklist,
- local boundary decision record,
- local evidence under approved KNX runtime storage,
- local verification that no remote is configured,
- local commits for readiness artifacts.

Allowed output location:

- `_bmad/memory/knx/runtime/greenfield-implementation/remote-readiness/`

## Required Future Decisions Before Any Remote Operation

Before any remote workflow, record:

- named workflow or capability,
- platform target,
- remote URL,
- repository owner,
- repository visibility,
- operation class,
- data that would leave the local machine,
- authentication/credential boundary,
- rollback or recovery plan,
- safety review result,
- explicit user approval.

Operation classes requiring separate approval:

- `git remote add`,
- `git fetch`,
- `git pull`,
- `git push`,
- GitHub repository creation,
- PRs,
- issues,
- actions,
- releases,
- packages,
- remote review,
- publication.

## Exclusions

Not approved:

- GitHub/remotes,
- remote creation,
- push, pull, fetch,
- GitHub API calls,
- PRs/issues/actions/releases/packages,
- repository visibility changes,
- credentials or authentication setup,
- external sends,
- public distribution,
- company sharing,
- license or rights grants,
- runtime assistant behavior.

## Validation Plan

Run:

- `git remote -v`,
- JSON parse for readiness evidence,
- `git diff --check`,
- targeted sensitive-pattern scan.

## Safety Review

Safety status: pass with concerns.

Concerns:

- Future remote setup can send local source and governance records outside the machine.
- Remote metadata can imply ownership, publication, or collaboration rights.
- Credentials and authentication must not be inferred from local planning.

Mitigations:

- Keep remotes disabled now.
- Require later explicit approval with target URL and operation class.
- Keep publication and company sharing separately gated.

## Approval Basis

User approved Gate 5 on 2026-06-01.

## Relationship To Prior Decisions

This decision extends `github-remote-posture-2026-06-01.md` with local readiness planning only.

It does not approve any actual remote operation.

## Decision Sources

- `_bmad/memory/knx/decisions/github-remote-posture-2026-06-01.md`
- `_bmad/memory/knx/runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`
- local `git remote -v` check
- User approval on 2026-06-01.
