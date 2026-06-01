# KNX Data Boundaries

Last updated: 2026-06-01

## Boundary Status

Status: provisional

Reason: storage mode and local Git source/review boundary are known, but storage root, allowed source roots, Git remote/GitHub boundary, local model runtime, and standing external-provider approvals are unresolved.

## Storage Mode And Root

- Storage mode: local-folder
- Storage mode source: profile-derived from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- Storage root: unresolved
- Storage root source: profile-derived; config value is empty.
- Current durable setup storage: `_bmad/memory/knx`
- Runtime/live assistant state: forbidden outside `_bmad/memory/knx` until a storage root is explicitly approved.

## Repo Boundary

- Git repository: detected at `C:/Users/slaw_dawg/Kendall_Nxt`.
- Current branch: `main`.
- Repo remote: unresolved; no remote is configured.
- Local Git role: approved for source control, local review, diff/status inspection, and commit history for this project only.
- GitHub/remote role: unresolved; no push, pull, PR, issue, action, release, deployment, or remote review workflow is approved by this boundary plan.
- Git/GitHub runtime rule: Git and GitHub are source/review boundaries only, not live deployment/runtime state.
- Effective rule: do not use Git, GitHub, branches, commits, remotes, PRs, releases, or actions as live assistant state or deployment storage unless a later decision explicitly records the risk and approval.

Source: local Git detection and data-boundary decision `decisions/data-boundary-2026-06-01.md`.

## Source Class Table

| Source or output class | Storage location | Processing engine | Destination | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Public or synthetic sample data | `_bmad/memory/knx/fixtures/synthetic` or approved local storage root when defined | Deterministic local processing; mature local tools | Local generated artifacts under approved storage | Provisional | Defaulted |
| User-authored planning documents | `_bmad/memory/knx` for KNX memory; approved source roots once defined | Deterministic local processing; mature local tools | Local drafts and review packages | Provisional | Defaulted; source roots unresolved |
| Operational assistant state | `_bmad/memory/knx` during setup only; approved storage root when defined | Deterministic local processing | Approved local storage only | Provisional | Profile-derived |
| Email/calendar/meeting content | Not approved | Not approved | Not approved | Unresolved | Defaulted conservative class |
| Attachments and exported files | Not approved unless placed in an approved source root and classified | Deterministic local processing only after approval | Approved local storage only | Unresolved | Defaulted conservative class |
| Customer/project data | Not approved | Not approved | Not approved | Forbidden | Profile-derived forbidden destinations |
| Credentials, secrets, tokens, MFA, account/security material | Not approved | Not approved | Not approved | Forbidden | Profile-derived and defaulted safety rules |
| Generated drafts and review packages | `_bmad/memory/knx` or approved storage root when defined | Deterministic local processing; mature local tools; custom glue only after policy review | Approved local storage only | Provisional | Execution-policy-derived |
| Logs, caches, fixtures, indexes, and temporary files | `_bmad/memory/knx` for setup notes; approved storage root when defined | Deterministic local processing; mature local tools | Approved local storage only | Provisional | Defaulted; storage root unresolved |
| Git repository metadata and history | Existing local `.git` metadata for source/review only | Git CLI and deterministic local inspection | Local source/review records only; no remote destination until approved | Provisional | Local detection and data-boundary decision |

## Allowed Storage Locations

- `_bmad/memory/knx` for KNX setup memory, policy files, decision records, daily logs, and synthetic fixtures.
- `_bmad/memory/knx/fixtures/synthetic` for synthetic test data only.

Provisional or unresolved:

- A local-folder storage root is intended but unresolved.
- The existing local Git repository may store source-control metadata for this project only.
- Git repository directories are not approved as live assistant state or generated-artifact storage destinations.
- OneDrive, Microsoft 365 surfaces, app data directories, sync providers, Git remotes, GitHub, and external storage are not approved as storage destinations by this plan.

## Allowed Processing Engines

Allowed:

- Mature local tools already inside approved project/user boundaries.
- Deterministic local processing for parsing, filtering, indexing, validation, extraction, formatting, fixtures, and repeatable transforms.

Provisional:

- Custom glue code only after mature-tool-first and deterministic-first checks are recorded.
- Local model runtimes only after availability and boundaries are explicitly confirmed.

Forbidden without later exception:

- External LLM/GPT/provider processing.
- Customer-system or production-system processing.
- Credential, MFA, token, or account/security processing.

Source: execution-policy-derived and profile-derived.

## Forbidden Destinations

- External providers without recorded policy or explicit per-use approval.
- Customer systems.
- Production systems.
- Credential stores.
- Account/security settings.
- Unapproved source roots.
- Unapproved storage or sync destinations.
- Git/GitHub as live assistant runtime/deployment state.
- Git remotes, GitHub PRs/issues/actions/releases, and remote review workflows unless explicitly approved by a later boundary decision.
- Any destination requiring destructive or ambiguous data-loss decisions.

Source: profile-derived and defaulted.

## External Provider Rules

External provider use is layer 5 and last-resort only.

Effective rule while this plan is provisional:

- No external provider sends unless the user gives explicit approval for the specific send or a recorded policy permits that specific class of send.
- Never send credentials, account/security material, customer data, production data, or ambiguous source material.
- External-provider processing for sensitive classes requires a later recorded policy exception and approval path; this workflow does not approve it.

Source: execution-policy-derived.

## Approval Gates For Boundary Expansion

Record a decision before expanding any of these boundaries:

- Approving a storage root outside `_bmad/memory/knx`.
- Approving source roots for reading, planning, or mutation.
- Enabling Git/GitHub source-control or review workflows.
- Enabling GitHub, Git remotes, PRs, issues, actions, releases, or remote review workflows.
- Allowing custom code that writes, syncs, mutates, indexes, or exports data.
- Allowing local model runtime or GPU-backed processing.
- Allowing any external provider send.
- Allowing email/calendar/meeting content, attachments, exported files, customer/project data, production data, credentials, or account/security material.

Accepted expansions must be written to `decisions/data-boundary-YYYY-MM-DD.md` or a more specific decision record before downstream workflows rely on them.

## Validation Checks And Fixture Requirements

Before operational workflows run:

- Verify the target storage path is explicitly recorded and exists or can be created safely.
- Verify each source root is explicitly listed and classified.
- Verify generated artifacts are written only to approved local storage.
- Verify synthetic fixtures are stored under `_bmad/memory/knx/fixtures/synthetic`.
- Verify no credential, token, MFA, account/security, customer, or production data is copied into KNX memory.
- Verify external-provider calls are absent unless a matching approval or policy record exists.
- Verify Git/GitHub is not used as live runtime/deployment state.
- Verify local Git use remains source/review only.
- Verify no Git remote, GitHub PR/issue/action/release, push, pull, or remote review workflow is used unless a matching boundary decision exists.

## Open Questions

1. What local folder is approved as the KNX storage root for live state and generated artifacts?
2. Which source roots are approved for reading, planning, and possible mutation?
3. Should a Git remote or GitHub boundary be enabled for source and review work, and what remote should be recorded?
4. Which source classes should KNX handle first: planning docs, generated drafts, exported files, fixtures, or something else?
5. Is any local model runtime or GPU-backed processing approved?
6. Are any external provider sends approved by standing policy, or should all sends require per-use approval?

## Decision Sources

- Boundary status: profile-derived, local Git detection, and defaulted.
- Storage mode: profile-derived.
- Storage root: unresolved.
- Repo boundary: local Git detection and data-boundary decision `decisions/data-boundary-2026-06-01.md`.
- Source class table: defaulted, profile-derived, and execution-policy-derived.
- Allowed storage locations: defaulted and profile-derived.
- Allowed processing engines: execution-policy-derived.
- Forbidden destinations: profile-derived and defaulted.
- External provider rules: execution-policy-derived.
- Approval gates: defaulted.
- Validation checks: defaulted.
