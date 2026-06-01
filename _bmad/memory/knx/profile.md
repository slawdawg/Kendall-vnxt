# KendallAI vNext Install Profile

Last updated: 2026-06-01

## Setup Status

Status: partial

Reason: safety and execution defaults are available and the local Git source/review boundary is detected, but storage root, allowed source roots, Git remote/GitHub boundary, local model status, and external-provider standing approvals remain unresolved.

## User Label

- Value: Bob
- Source: detected from `_bmad/config.user.yaml` (`knx_user_label`) and consistent with `_bmad/config.yaml`.

## Storage

- Mode: local-folder
- Source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- Storage root: unresolved
- Storage root source: config value is empty.
- Live state policy: do not write live deployment/runtime state outside `_bmad/memory/knx` until a storage root is explicitly chosen.

## Source Control Boundary

- Project path: `C:/Users/slaw_dawg/Kendall_Nxt`
- Git repository: detected
- Current branch: `main`
- Local Git use: source control, local review, diff/status inspection, and commit history only.
- Repo remote: unresolved; no remote is configured.
- Repo remote source: config value is empty and local `git remote -v` returned no configured remote.
- GitHub/source review use: unresolved until a remote/GitHub boundary is explicitly configured.
- Git/GitHub live-state policy: do not use Git or GitHub as live assistant runtime state, live deployment state, generated-artifact storage, operational source intake approval, source mutation approval, external-provider approval, or customer/production integration.

## Compute

- Local compute policy: local-first
- Local compute policy source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- GPU/local accelerator availability: unknown
- GPU/local accelerator source: detected from config as `unknown`; not probed during setup.
- Local model status: unresolved

## External Provider Policy

- Policy: last-resort-with-approval-or-policy
- Source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- Effective setup behavior while partial: no external provider sends unless a user-approved policy explicitly permits the specific send.

## Allowed Source Roots

- Allowed roots: unresolved
- Source: config value is empty.
- Effective setup behavior while partial: treat no source roots as approved for mutation or live-system access.

## Forbidden Destinations

- External providers without policy
- Customer systems
- Production systems
- Credential stores
- Account/security settings
- Source mutation without approval
- Destructive or ambiguous data-loss actions

Sources:

- External providers without policy, customer systems, and production systems were detected from config.
- Credential stores, account/security settings, source mutation without approval, destructive actions, and ambiguous data-loss actions are defaulted from KNX safety rules.

## Approval Policy

Configured shorthand: `no-send/no-mutation/credentials/account-security/customer-production/destructive`

Expanded effective policy:

- No external sends without explicit approval or recorded policy.
- No source mutation without explicit approval or recorded policy.
- No credential access, storage, use, or modification.
- No account/security setting changes.
- No customer or production system access.
- No destructive actions.
- No ambiguous data-loss decisions.

Source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`, expanded with KNX defaults.

## Open Setup Questions

1. What local folder should be the KNX storage root for live state and generated artifacts?
2. Which source roots are allowed for reading, planning, and possible mutation?
3. Should this project use a Git remote or GitHub for source and review work? If yes, what remote and which workflows are approved?
4. Is a GPU or other local accelerator available for local models?
5. Are any external LLM providers approved by policy, or should all external provider use remain approval-only?

## Decision Sources

- User label: detected
- Storage mode: detected
- Storage root: unresolved
- Local Git repository: detected
- Repo remote: unresolved
- Local compute policy: detected
- External provider policy: detected
- GPU/local accelerator availability: detected as unknown
- Allowed source roots: unresolved
- Forbidden destinations: detected and defaulted
- Approval policy: detected and defaulted
