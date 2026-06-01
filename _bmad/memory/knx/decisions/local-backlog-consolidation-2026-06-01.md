# KNX Local Backlog Consolidation

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: consolidate the active KNX backlog around internal-only governance and evidence hardening. Parked or hard-gated paths must not drive the active workflow.

## Short Summary

KNX governance core and `ksev` are usable locally. The remaining active work is evidence hardening and clarity work inside approved KNX memory/runtime storage.

## Current Active Internal Work

Fast-lane eligible:

- Create metadata-only source packet templates/examples for the three approved first classes:
  - `user-authored-planning-document`
  - `public-or-synthetic-sample-data`
  - `generated-report`
- Keep source packet examples local and metadata-only.
- Update safety review and source/evidence contract links after source packet examples are created.
- Continue local validator and fixture hardening only when it stays inside approved KNX memory/runtime locations.

## Parked Paths

Parked until explicitly reopened:

- Company-facing discussion.
- Sharing-readiness review.
- Company evaluation access.
- External sends.
- IDE one-click button/action.
- Public distribution.

## Hard Gates

Still require explicit user approval:

- GitHub/remotes, pushes, pulls, PRs, issues, actions, releases, packages, or publication.
- Public license activation or rights grants.
- Company sharing or external sends.
- Source mutation outside scoped KNX governance/evidence records.
- Writes outside approved KNX memory/runtime locations.
- IDE/workspace configuration.
- Customer/production access.
- Credential/account-security workflows.
- Local model/GPU processing.
- Destructive actions.
- Risk score `9` waivers.

## Next Fast-Lane Workflow

Next workflow: create metadata-only source packet templates/examples for the approved first source classes.

Why fast-lane: it is local-only governance/evidence work under approved KNX memory/runtime locations, does not copy source contents, does not mutate operational source, and does not send externally.

## Decision Sources

- `_bmad/memory/knx/decisions/fast-lane-local-governance-2026-06-01.md`
- `_bmad/memory/knx/decisions/company-facing-discussion-parked-2026-06-01.md`
- `_bmad/memory/knx/decisions/source-packet-classes-2026-06-01.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
