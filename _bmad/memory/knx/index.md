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
- Latest local commit: `a6f2bbf Record KNX commercial license posture`
- Prior local commit status sync: `88aa647 Record KNX local commit status`
- Latest workflow continuation audit: [runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md](runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md)
- Latest source inventory planning decision: [decisions/source-inventory-planning-2026-06-01.md](decisions/source-inventory-planning-2026-06-01.md)
- Latest source inventory evidence: [runtime/source-inventory/source-inventory-2026-06-01.md](runtime/source-inventory/source-inventory-2026-06-01.md)
- Latest source inventory validation evidence: [runtime/source-inventory/validation-source-inventory-2026-06-01.json](runtime/source-inventory/validation-source-inventory-2026-06-01.json)
- Latest source packet class decision: [decisions/source-packet-classes-2026-06-01.md](decisions/source-packet-classes-2026-06-01.md)
- Latest source mutation posture decision: [decisions/source-mutation-posture-2026-06-01.md](decisions/source-mutation-posture-2026-06-01.md)
- Latest artifact ID convention decision: [decisions/artifact-id-convention-2026-06-01.md](decisions/artifact-id-convention-2026-06-01.md)
- Latest risk waiver authority decision: [decisions/risk-waiver-authority-2026-06-01.md](decisions/risk-waiver-authority-2026-06-01.md)
- Latest local model/GPU posture decision: [decisions/local-model-gpu-posture-2026-06-01.md](decisions/local-model-gpu-posture-2026-06-01.md)
- Latest GitHub/remote posture decision: [decisions/github-remote-posture-2026-06-01.md](decisions/github-remote-posture-2026-06-01.md)
- Latest runtime evidence inventory planning decision: [decisions/runtime-evidence-inventory-planning-2026-06-01.md](decisions/runtime-evidence-inventory-planning-2026-06-01.md)
- Latest approval gate flow decision: [decisions/approval-gate-flow-2026-06-01.md](decisions/approval-gate-flow-2026-06-01.md)
- Latest runtime evidence inventory: [runtime/runtime-inventory/runtime-inventory-2026-06-01.md](runtime/runtime-inventory/runtime-inventory-2026-06-01.md)
- Latest runtime evidence inventory validation: [runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json](runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json)
- Latest `ksev` private-repo distribution plan: [decisions/ksev-private-repo-distribution-plan-2026-06-01.md](decisions/ksev-private-repo-distribution-plan-2026-06-01.md)
- Latest `ksev` distribution metadata posture: [decisions/ksev-distribution-metadata-posture-2026-06-01.md](decisions/ksev-distribution-metadata-posture-2026-06-01.md)
- Latest company commercial license posture: [decisions/company-commercial-license-posture-2026-06-01.md](decisions/company-commercial-license-posture-2026-06-01.md)

## Current Routing

- Latest coordinator decision: [decisions/governance-coordinator-2026-06-01.md](decisions/governance-coordinator-2026-06-01.md)
- Latest data-boundary decision: [decisions/data-boundary-2026-06-01.md](decisions/data-boundary-2026-06-01.md)
- Current recommended next workflow: route by concrete capability. Use `knx-source-evidence-contract` for fixture/evidence changes, `knx-mature-tool-review` before any source inventory materialization workflow, and `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, or operational source intake.
- First-pass source inventory evidence is materialized. It excludes runtime evidence paths and is limited to governance/validator source and report artifacts. Next routing should be by concrete capability.
- First real source packet classes are selected: `user-authored-planning-document`, `public-or-synthetic-sample-data`, and `generated-report`.
- Source mutation remains blocked by default; future mutation requires a named workflow, exact target paths, rollback/recovery plan, validation plan, safety review, and explicit approval.
- Source/evidence contract open questions for the current governance/local-evidence scope are resolved.
- Data-boundary and execution-policy open questions for the current governance/local-evidence scope are resolved.
- Runtime evidence inventory is materialized. It is metadata-only and excludes `_bmad/memory/knx/runtime/runtime-inventory/**` to avoid self-inclusion.
- Gate flow: present summary and why gated, execute after approval, then immediately present the next gate details.
- `ksev` public-distribution readiness planning is active. Current manifest remains local-only; distribution metadata posture is accepted.
- Company commercial licensing posture is accepted for planning: keep KNX and `ksev` private/local and `UNLICENSED` to preserve a future private commercial license path. Next gate is company evaluation access protocol.

## Active Boundaries

- Approved storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Approved source root: `C:/Users/slaw_dawg/Kendall_Nxt`
- Approved source operation: read/planning only.
- Local Git staging and local commits are approved for scoped KNX governance and validator work.
- Source mutation, broader or operational source inventory generation, GitHub/remotes, external providers, local model/GPU processing, customer/production access, credentials, account/security workflows, runtime assistant behavior, and public distribution remain blocked unless separately approved.
