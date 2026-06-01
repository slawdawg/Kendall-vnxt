# KNX Current Work Paused

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: pause active KNX work. Internal evidence hardening is in a good local state, and no further workflow should proceed until the user requests a concrete capability or reopens a parked path.

## Short Summary

The active KNX workstream is paused after governance/evidence hardening, source packet example validation, and handoff refresh.

## Current Good State

- KNX governance core is scaffolded and validated.
- `ksev` is local-only and validated.
- `ksev` validates synthetic fixtures and metadata-only source packet examples.
- Metadata-only source packet examples are materialized and validated.
- Company-facing discussion is parked.
- IDE one-click action is closed.
- Public distribution, GitHub/remotes, source mutation, external sends, and rights grants remain hard-gated.

## Resume Condition

Resume only when the user requests a concrete capability or explicitly reopens a parked/hard-gated path.

Recommended routing on resume:

- `knx-source-evidence-contract` for new evidence/source packet contracts.
- `knx-safety-validation-review` before any new optional pack or boundary expansion.
- `knx-mature-tool-review` before new tooling or automation.
- `bmad-module-builder` validation after module packaging changes.

## Boundaries

This pause does not approve:

- external sends,
- company sharing,
- GitHub/remotes,
- public distribution,
- license or rights grants,
- source mutation outside scoped KNX governance/evidence records,
- writes outside approved KNX memory/runtime storage,
- customer/production access,
- credential/account-security workflows,
- local model/GPU processing,
- destructive actions,
- risk score `9` waivers.

## Decision Sources

- User approval on 2026-06-01.
- `_bmad/memory/knx/runtime/handoffs/handoff-2026-06-01-current.md`
- `_bmad/memory/knx/decisions/local-backlog-consolidation-2026-06-01.md`
- `_bmad/memory/knx/decisions/fast-lane-local-governance-2026-06-01.md`
