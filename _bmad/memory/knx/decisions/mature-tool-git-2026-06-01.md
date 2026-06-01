# Mature Tool Decision - Local Git Source Review

Last updated: 2026-06-01

## Decision Status

Status: accepted

## Capability Or Workflow Reviewed

Local Git source control and source/review workflow for the KNX project after the Git boundary refresh.

## Decision

Accept local Git CLI as the mature tool for source control, local review, diff/status inspection, and commit history inside `C:/Users/slaw_dawg/Kendall_Nxt`.

Defer GitHub, Git remotes, PRs, issues, actions, releases, deployments, and remote review workflows until a specific remote workflow is proposed and approved by data-boundary, execution-policy, and safety-review records.

Defer custom Git automation because mature local Git commands and existing BMad/KNX governance records are sufficient for the current source/review need.

## Research Questions

- Does mature local tooling satisfy current source/review needs?
- Does the option fit the install profile and data-boundary plan?
- Does the option require external providers, accounts, credentials, customer/production access, or source mutation?
- Is custom code needed now?
- What rollback exists if remote workflows remain unapproved?

## Options Considered

- Local Git CLI: accepted for source/review only.
- Existing repository hygiene via `.gitignore` and `.gitattributes`: accepted as supporting local practice.
- GitHub or Git remote workflows: deferred.
- GitHub Actions, releases, deployments, or remote automation: blocked until later boundary and execution-policy decisions.
- Custom Git automation: deferred.

## Fit Against Execution Policy

Fit: pass with concerns

Local Git CLI is mature local tooling and deterministic local processing. It does not require local model runtime, GPU, external providers, or custom operational code.

Concerns remain for any remote workflow or automation that would expand execution boundaries.

## Fit Against Data-Boundary Plan

Fit: pass with concerns

Local Git is accepted for source/review only. GitHub and remotes remain unresolved. Git/GitHub remains forbidden as live assistant runtime or deployment state.

## Cost Posture

No new paid service, account, or install requirement for local Git use.

## Security And Privacy Posture

Local Git avoids external sends but can still capture inappropriate files if repository hygiene fails. Commits should be reviewed before publishing or sharing. This decision does not approve committing secrets, credentials, customer data, production data, account/security material, or unapproved source material.

## Maintenance And Dependency Posture

Local Git is mature and already available in the project workflow. No new dependency is introduced.

## Licensing Or Usage Constraints

No new license or service terms are introduced by local Git use. Remote hosting terms remain out of scope.

## Recommendation

Use local Git only for source/review. Require a later KNX boundary and safety review before any GitHub, remote, PR, issue, action, release, deployment, or remote review workflow.

## Custom-Code Scope

Status: deferred

No custom code is accepted for Git workflows in this decision.

## Rollback Or Exit Path

Continue with local Markdown governance records and local Git review only. If a remote workflow is not approved, no remote dependency is required.

## Evidence Links Or Local Source References

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/decisions/data-boundary-2026-06-01.md`

## Assumptions And Open Questions

Assumptions:

- No Git remote is configured.
- Local Git remains source/review only.
- No GitHub workflow has been proposed.

Open questions:

1. Should a Git remote be recorded?
2. Should GitHub PRs or issues be allowed?
3. Should local pre-commit validation be reviewed as a separate capability?
4. Which source roots and storage root should be approved before operational work?

## Decision Sources

- User request to run `knx-mature-tool-review`.
- Local Git detection from the project workspace.
- KNX profile and data-boundary Git refresh.
- KNX execution policy mature-tool-first and deterministic-first rules.
