# KendallAI vNext Memory Index

Last updated: 2026-06-01

## Core Files

- [profile.md](profile.md) - install profile, setup status, boundaries, and open setup questions.
- [execution-policy.md](execution-policy.md) - local-first execution and provider-use policy.
- [data-boundaries.md](data-boundaries.md) - allowed source roots, forbidden destinations, and storage boundaries.
- [tool-evaluation.md](tool-evaluation.md) - mature-tool review notes and custom-code decision records.
- [source-evidence-contract.md](source-evidence-contract.md) - artifact, traceability, validation evidence, and fixture contracts.

## Logs And Working Areas

- [daily/](daily/) - dated setup and workflow notes.
- [decisions/](decisions/) - durable decision records.
- [fixtures/synthetic/](fixtures/synthetic/) - synthetic test data only; no real customer, credential, or production data.
- [runtime/](runtime/) - approved KNX runtime storage root for local reports and validation evidence.

## Current Module State

- KNX governance core: scaffolded and validated.
- Optional source/evidence validator: scaffolded, structurally validated, safety-reviewed, and held as local installable packaging evidence.
- Latest validator distribution decision: [decisions/validator-distribution-2026-06-01.md](decisions/validator-distribution-2026-06-01.md)
- Latest local Git commit decision: [decisions/local-git-commit-2026-06-01.md](decisions/local-git-commit-2026-06-01.md)
- Latest validator validation report: [../../skills/reports/module-validation-ksev-2026-06-01.md](../../skills/reports/module-validation-ksev-2026-06-01.md)
- Latest local commit-readiness checkpoint: [runtime/commit-readiness/reports/commit-readiness-2026-06-01.md](runtime/commit-readiness/reports/commit-readiness-2026-06-01.md)
- Proposed staging plan: [runtime/commit-readiness/reports/staging-plan-2026-06-01.md](runtime/commit-readiness/reports/staging-plan-2026-06-01.md)
- Latest handoff: [runtime/handoffs/handoff-2026-06-01.md](runtime/handoffs/handoff-2026-06-01.md)

## Current Routing

- Latest coordinator decision: [decisions/governance-coordinator-2026-06-01.md](decisions/governance-coordinator-2026-06-01.md)
- Latest data-boundary decision: [decisions/data-boundary-2026-06-01.md](decisions/data-boundary-2026-06-01.md)
- Current recommended next workflow: route by concrete capability. Use `knx-source-evidence-contract` for fixture/evidence changes, `knx-mature-tool-review` before any source inventory materialization workflow, and `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, or operational source intake.

## Active Boundaries

- Approved storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Approved source root: `C:/Users/slaw_dawg/Kendall_Nxt`
- Approved source operation: read/planning only.
- Local Git staging and local commits are approved for scoped KNX governance and validator work.
- Source mutation, source inventory generation, GitHub/remotes, external providers, local model/GPU processing, customer/production access, credentials, account/security workflows, runtime assistant behavior, and public distribution remain blocked unless separately approved.
