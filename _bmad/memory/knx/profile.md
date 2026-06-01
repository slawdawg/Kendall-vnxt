# KendallAI vNext Install Profile

Last updated: 2026-06-01

## Setup Status

Status: partial

Reason: storage root, allowed source root, local Git source/review boundary, GitHub/remote disablement, and per-use external-provider approval policy are recorded. Setup remains partial because local model status and GPU/local accelerator availability are unresolved, and source mutation remains approval-gated.

## User Label

- Value: Bob
- Source: detected from `_bmad/config.user.yaml` (`knx_user_label`) and consistent with `_bmad/config.yaml`.

## Storage

- Mode: local-folder
- Source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- Storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Storage root source: user-specified on 2026-06-01 and recorded in `_bmad/config.user.yaml`.
- Live state policy: write KNX live/generated artifacts only under the approved storage root unless a later decision expands storage.

## Source Control Boundary

- Project path: `C:/Users/slaw_dawg/Kendall_Nxt`
- Git repository: detected
- Current branch: `main`
- Local Git use: source control, local review, diff/status inspection, and commit history only.
- Repo remote: none approved for now; no remote is configured.
- Repo remote source: user-specified no GitHub/remote for now on 2026-06-01; local `git remote -v` returned no configured remote.
- GitHub/source review use: disabled for now unless a later boundary decision explicitly enables it.
- Git/GitHub live-state policy: do not use Git or GitHub as live assistant runtime state, live deployment state, generated-artifact storage, operational source intake approval, source mutation approval, external-provider approval, or customer/production integration.

## Compute

- Local compute policy: local-first
- Local compute policy source: detected from `_bmad/config.yaml` and `_bmad/config.user.yaml`.
- GPU/local accelerator availability: unknown
- GPU/local accelerator source: detected from config as `unknown`; local `nvidia-smi` probe on 2026-06-01 returned not found, which does not confirm accelerator absence.
- Local model status: unresolved

## External Provider Policy

- Policy: per-use approval only
- Source: user-specified on 2026-06-01 and recorded in `_bmad/config.user.yaml`.
- Effective setup behavior while partial: no external provider sends unless the user explicitly approves the specific send.

## Allowed Source Roots

- Allowed roots: `C:/Users/slaw_dawg/Kendall_Nxt`
- Source: user-specified on 2026-06-01 and recorded in `_bmad/config.user.yaml`.
- Allowed operations: read and planning only.
- Mutation policy: no source mutation without explicit approval.
- Effective setup behavior while partial: use the approved source root for read/planning workflows only; no live-system access.

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

1. Is a GPU or other local accelerator available for local models? Local `nvidia-smi` was not found on 2026-06-01, so this remains unresolved unless another accelerator path is confirmed.
2. Is any local model runtime installed and approved?
3. Should any future workflow expand beyond read/planning into source mutation? If yes, a separate approval is required.

## Decision Sources

- User label: detected
- Storage mode: detected
- Storage root: user-specified
- Local Git repository: detected
- Repo remote: user-specified none for now
- Local compute policy: detected
- External provider policy: user-specified per-use approval only
- GPU/local accelerator availability: detected as unknown; `nvidia-smi` not found locally on 2026-06-01
- Allowed source roots: user-specified for read/planning only
- Forbidden destinations: detected and defaulted
- Approval policy: detected and defaulted
