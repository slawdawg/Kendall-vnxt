# Data Boundary Decision - Git Source Review Boundary

Last updated: 2026-06-01

## Decision Status

Status: accepted

## Capability Or Boundary Reviewed

Refresh the KNX Git boundary after the project folder was initialized as a local Git repository.

## Decision

Accept local Git for source control, local review, diff/status inspection, and commit history inside `C:/Users/slaw_dawg/Kendall_Nxt`.

Do not approve GitHub, Git remotes, pushes, pulls, PRs, issues, actions, releases, deployments, or remote review workflows. Do not approve Git or GitHub as live assistant runtime state, live deployment state, generated-artifact storage, operational source intake, source mutation approval, external-provider approval, or customer/production integration.

## Rationale

The workspace now contains a local Git repository. Prior KNX memory still recorded Git as not detected, which made the boundary stale. Updating the data-boundary plan resolves the local detection mismatch while preserving the KNX rule that Git/GitHub remains source/review only.

## Scope

Applies only to the local repository at:

- `C:/Users/slaw_dawg/Kendall_Nxt`

Current detected branch:

- `main`

Detected remote:

- none configured

## Approval Basis

Approval basis: user-requested governance update plus local deterministic Git detection.

## Fit Against Data Boundary Plan

Fit: pass with concerns

The local Git repository can be used for source/review activities inside the project. Concerns remain because storage root, allowed source roots, Git remote/GitHub boundary, local model/GPU availability, and external-provider standing approvals are unresolved.

## Fit Against Execution Policy

Fit: pass

Local Git inspection is mature local tooling and deterministic local processing. This decision does not require local models, GPU, custom operational code, external providers, credentials, account/security access, customer systems, or production systems.

## Boundary Rules

- Local Git is source/review only.
- GitHub and Git remotes remain unresolved.
- No pushes, pulls, PRs, issues, actions, releases, deployments, or remote review workflows are approved.
- Git must not be used as live assistant runtime state.
- Git must not be used as generated-artifact storage for live workflows.
- Git must not be treated as approval for source mutation, source intake, customer/production access, credentials, or external sends.

## Validation Checks

Before relying on Git or GitHub workflow decisions:

- Verify the repository path is `C:/Users/slaw_dawg/Kendall_Nxt`.
- Verify any remote is explicitly recorded before use.
- Verify local Git use is limited to source/review activity.
- Verify no GitHub, push, pull, PR, issue, action, release, deployment, or remote review workflow is used without a later decision.
- Verify generated outputs and live runtime state are not stored in Git as an operational state mechanism.

## Risk Score

Risk score: 3

Risk basis: local Git source/review use is low to medium risk when kept local, but the boundary remains provisional because remote/GitHub behavior and operational storage roots are unresolved.

Blocking status: nonblocking for local source/review use; blocking for GitHub/remote workflows until a later decision.

## Open Questions

1. Should a Git remote be recorded for source/review work?
2. Should GitHub PRs or issues be allowed for review workflows?
3. What storage root should be approved for live state and generated artifacts?
4. Which source roots are approved for reading, planning, or mutation?

## Decision Sources

- User request to refresh the KNX Git boundary.
- Local Git detection: repository detected at `C:/Users/slaw_dawg/Kendall_Nxt`.
- Local Git detection: current branch `main`.
- Local Git detection: no remote configured.
- Existing KNX profile, execution policy, and data-boundary plan.
