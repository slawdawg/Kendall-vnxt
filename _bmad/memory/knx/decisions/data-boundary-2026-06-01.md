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

---

# Data Boundary Decision - Storage Root And Source Root

Last updated: 2026-06-01

## Decision Status

Status: accepted

## Capability Or Boundary Reviewed

Approve a local KNX storage root and a local read/planning source root.

## Decision

Accept the following local boundary:

- Storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Allowed source root: `C:/Users/slaw_dawg/Kendall_Nxt`
- Allowed source operations: read and planning only
- Source mutation: not approved without explicit later approval
- GitHub/remote workflow: none approved for now
- External provider policy: per-use approval only
- GPU/local model status: unknown for now

## Approval Basis

Approval basis: user approved the recommended KNX profile setup choices on 2026-06-01.

## Fit Against Data Boundary Plan

Fit: pass with concerns

The boundary stays local and keeps generated artifacts under KNX memory. Concerns remain because source mutation, GitHub/remote workflows, local model runtime, GPU/local accelerator processing, and external provider sends are not broadly approved.

## Fit Against Execution Policy

Fit: pass

The approved scope supports mature local tools and deterministic local read/planning workflows. It does not approve custom operational code, external providers, credentials, account/security access, customer systems, production systems, or destructive actions.

## Boundary Rules

- Generated KNX artifacts must stay under the approved storage root unless a later decision expands storage.
- The approved source root may be used for read/planning workflows.
- Source mutation requires explicit later approval.
- Git remains source/review only.
- GitHub and remotes remain disabled for now.
- External provider sends require explicit per-use approval.

## Validation Checks

- Verify the storage root exists before writing generated artifacts.
- Verify source paths are under `C:/Users/slaw_dawg/Kendall_Nxt`.
- Verify the workflow is read/planning only unless mutation has a separate approval record.
- Verify no external provider call is made without per-use approval.
- Verify GitHub/remote workflows are not used.

## Risk Score

Risk score: 4

Risk basis: local read/planning and local generated artifact storage are moderate risk because the approved source root is broad, but mutation, remotes, external sends, credentials, customer systems, and production systems remain blocked.

Blocking status: nonblocking for local read/planning workflows that write generated artifacts under the approved storage root; blocking for mutation, remotes, external sends, local model/GPU workflows, customer/production access, credentials, and account/security workflows.

## Open Questions

1. Which source classes should be handled first?
2. Is any local model runtime or GPU-backed processing approved later?
3. Should any future workflow expand into source mutation?

## Decision Sources

- User request to refresh the KNX Git boundary.
- Local Git detection: repository detected at `C:/Users/slaw_dawg/Kendall_Nxt`.
- Local Git detection: current branch `main`.
- Local Git detection: no remote configured.
- Existing KNX profile, execution policy, and data-boundary plan.
