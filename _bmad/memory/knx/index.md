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
- Optional source/evidence validator: scaffolded, structurally validated, safety-reviewed, hardened for fixture/source-packet, work trace, validation evidence, user-input-required, and output metadata contract checks, and held as local installable packaging evidence.
- Latest validator distribution decision: [decisions/validator-distribution-2026-06-01.md](decisions/validator-distribution-2026-06-01.md)
- Latest local Git commit decision: [decisions/local-git-commit-2026-06-01.md](decisions/local-git-commit-2026-06-01.md)
- Latest validator validation report: [../../skills/reports/module-validation-ksev-2026-06-01.md](../../skills/reports/module-validation-ksev-2026-06-01.md)
- Latest local commit-readiness checkpoint: [runtime/commit-readiness/reports/commit-readiness-2026-06-01.md](runtime/commit-readiness/reports/commit-readiness-2026-06-01.md)
- Proposed staging plan: [runtime/commit-readiness/reports/staging-plan-2026-06-01.md](runtime/commit-readiness/reports/staging-plan-2026-06-01.md)
- Latest handoff: [runtime/handoffs/handoff-2026-06-01-current.md](runtime/handoffs/handoff-2026-06-01-current.md)
- Latest substantive KNX governance commit: `d6c69b7 Expand ksev fixture contract checks`
- Prior local commit status sync: `88aa647 Record KNX local commit status`
- Latest workflow continuation audit: [runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md](runtime/workflow-audits/bmad-workflow-continuation-2026-06-01.md)
- Latest source inventory planning decision: [decisions/source-inventory-planning-2026-06-01.md](decisions/source-inventory-planning-2026-06-01.md)
- Latest source inventory evidence: [runtime/source-inventory/source-inventory-2026-06-01.md](runtime/source-inventory/source-inventory-2026-06-01.md)
- Latest source inventory validation evidence: [runtime/source-inventory/validation-source-inventory-2026-06-01.json](runtime/source-inventory/validation-source-inventory-2026-06-01.json)
- Latest source packet class decision: [decisions/source-packet-classes-2026-06-01.md](decisions/source-packet-classes-2026-06-01.md)
- Latest source mutation posture decision: [decisions/source-mutation-posture-2026-06-01.md](decisions/source-mutation-posture-2026-06-01.md)
- Latest scoped source mutation approval: [decisions/scoped-source-mutation-knx-2026-06-01.md](decisions/scoped-source-mutation-knx-2026-06-01.md)
- Latest local write-boundary approval: [decisions/write-boundary-knx-local-2026-06-01.md](decisions/write-boundary-knx-local-2026-06-01.md)
- Latest source inventory/tooling gate: [decisions/source-inventory-tooling-gate-2026-06-01.md](decisions/source-inventory-tooling-gate-2026-06-01.md)
- Latest `ksev` public distribution readiness gate: [decisions/ksev-public-distribution-readiness-gate-2026-06-01.md](decisions/ksev-public-distribution-readiness-gate-2026-06-01.md)
- Latest GitHub/remote readiness gate: [decisions/github-remote-readiness-gate-2026-06-01.md](decisions/github-remote-readiness-gate-2026-06-01.md)
- Latest company evaluation planning gate: [decisions/company-evaluation-planning-gate-2026-06-01.md](decisions/company-evaluation-planning-gate-2026-06-01.md)
- Latest IDE/workspace planning gate: [decisions/ide-workspace-planning-gate-2026-06-01.md](decisions/ide-workspace-planning-gate-2026-06-01.md)
- Latest runtime assistant behavior planning gate: [decisions/runtime-assistant-behavior-planning-gate-2026-06-01.md](decisions/runtime-assistant-behavior-planning-gate-2026-06-01.md)
- Latest local model/GPU processing planning gate: [decisions/local-model-gpu-processing-planning-gate-2026-06-01.md](decisions/local-model-gpu-processing-planning-gate-2026-06-01.md)
- Latest access/security workflow planning gate: [decisions/access-security-workflows-planning-gate-2026-06-01.md](decisions/access-security-workflows-planning-gate-2026-06-01.md)
- Latest destructive/risk-waiver planning gate: [decisions/destructive-risk-waiver-planning-gate-2026-06-01.md](decisions/destructive-risk-waiver-planning-gate-2026-06-01.md)
- Latest artifact ID convention decision: [decisions/artifact-id-convention-2026-06-01.md](decisions/artifact-id-convention-2026-06-01.md)
- Latest risk waiver authority decision: [decisions/risk-waiver-authority-2026-06-01.md](decisions/risk-waiver-authority-2026-06-01.md)
- Latest local model/GPU posture decision: [decisions/local-model-gpu-posture-2026-06-01.md](decisions/local-model-gpu-posture-2026-06-01.md)
- Latest GitHub/remote posture decision: [decisions/github-remote-posture-2026-06-01.md](decisions/github-remote-posture-2026-06-01.md)
- Latest runtime evidence inventory planning decision: [decisions/runtime-evidence-inventory-planning-2026-06-01.md](decisions/runtime-evidence-inventory-planning-2026-06-01.md)
- Latest approval gate flow decision: [decisions/approval-gate-flow-2026-06-01.md](decisions/approval-gate-flow-2026-06-01.md)
- Latest fast-lane local governance profile: [decisions/fast-lane-local-governance-2026-06-01.md](decisions/fast-lane-local-governance-2026-06-01.md)
- Latest default-proceed local workflow: [decisions/default-proceed-local-workflow-2026-06-01.md](decisions/default-proceed-local-workflow-2026-06-01.md)
- Latest runtime evidence inventory: [runtime/runtime-inventory/runtime-inventory-2026-06-01.md](runtime/runtime-inventory/runtime-inventory-2026-06-01.md)
- Latest runtime evidence inventory validation: [runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json](runtime/runtime-inventory/validation-runtime-inventory-2026-06-01.json)
- Latest `ksev` private-repo distribution plan: [decisions/ksev-private-repo-distribution-plan-2026-06-01.md](decisions/ksev-private-repo-distribution-plan-2026-06-01.md)
- Latest `ksev` distribution metadata posture: [decisions/ksev-distribution-metadata-posture-2026-06-01.md](decisions/ksev-distribution-metadata-posture-2026-06-01.md)
- Latest company commercial license posture: [decisions/company-commercial-license-posture-2026-06-01.md](decisions/company-commercial-license-posture-2026-06-01.md)
- Latest company evaluation access protocol: [decisions/company-evaluation-access-protocol-2026-06-01.md](decisions/company-evaluation-access-protocol-2026-06-01.md)
- Latest evaluation candidate packet scope: [decisions/evaluation-candidate-packet-scope-2026-06-01.md](decisions/evaluation-candidate-packet-scope-2026-06-01.md)
- Latest local evaluation packet draft: [runtime/evaluation-packet/evaluation-packet-2026-06-01.md](runtime/evaluation-packet/evaluation-packet-2026-06-01.md)
- Latest local evaluation packet inventory: [runtime/evaluation-packet/artifact-inventory-2026-06-01.json](runtime/evaluation-packet/artifact-inventory-2026-06-01.json)
- Latest evaluation packet hardening review: [runtime/evaluation-packet/hardening-review-2026-06-01.md](runtime/evaluation-packet/hardening-review-2026-06-01.md)
- Latest external discussion-guide scope: [decisions/external-discussion-guide-scope-2026-06-01.md](decisions/external-discussion-guide-scope-2026-06-01.md)
- Latest local discussion-guide draft: [runtime/evaluation-packet/discussion-guide-2026-06-01.md](runtime/evaluation-packet/discussion-guide-2026-06-01.md)
- Latest company-facing discussion posture: [decisions/company-facing-discussion-parked-2026-06-01.md](decisions/company-facing-discussion-parked-2026-06-01.md)
- Latest local backlog consolidation: [decisions/local-backlog-consolidation-2026-06-01.md](decisions/local-backlog-consolidation-2026-06-01.md)
- Latest local backlog: [runtime/backlog/local-backlog-2026-06-01.md](runtime/backlog/local-backlog-2026-06-01.md)
- Latest source packet examples: [runtime/source-packets/source-packet-examples-2026-06-01.md](runtime/source-packets/source-packet-examples-2026-06-01.md)
- Latest source packet example validator report: [runtime/source-packets/validator-report/source-evidence-validation.md](runtime/source-packets/validator-report/source-evidence-validation.md)
- Latest pause decision: [decisions/pause-current-work-2026-06-01.md](decisions/pause-current-work-2026-06-01.md)
- Latest greenfield implementation lane: [decisions/greenfield-implementation-lane-2026-06-01.md](decisions/greenfield-implementation-lane-2026-06-01.md)
- Latest greenfield implementation runway: [runtime/greenfield-implementation/implementation-runway-2026-06-01.md](runtime/greenfield-implementation/implementation-runway-2026-06-01.md)
- Latest `ksev` local registration trace: [runtime/greenfield-implementation/work-trace-ksev-registration-2026-06-01.md](runtime/greenfield-implementation/work-trace-ksev-registration-2026-06-01.md)
- Latest hard-gate workthrough plan: [runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md](runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md)

## Current Routing

- Latest coordinator decision: [decisions/governance-coordinator-2026-06-01.md](decisions/governance-coordinator-2026-06-01.md)
- Latest data-boundary decision: [decisions/data-boundary-2026-06-01.md](decisions/data-boundary-2026-06-01.md)
- Current recommended next workflow: continue the approved local-only greenfield implementation lane for the installable KNX governance core plus standalone `ksev` validator. Use `bmad-module-builder` only for named packaging or validation changes, `knx-source-evidence-contract` for fixture/evidence changes, `knx-mature-tool-review` before any new tooling or source inventory materialization workflow, and `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, or operational source intake.
- First-pass source inventory evidence is materialized. It excludes runtime evidence paths and is limited to governance/validator source and report artifacts. Next routing should be by concrete capability.
- First real source packet classes are selected: `user-authored-planning-document`, `public-or-synthetic-sample-data`, and `generated-report`.
- Source mutation remains blocked by default outside the accepted scoped KNX module/governance exception. Future mutation beyond that exception requires a named workflow, exact target paths, rollback/recovery plan, validation plan, safety review, and explicit approval.
- Source/evidence contract open questions for the current governance/local-evidence scope are resolved.
- Data-boundary and execution-policy open questions for the current governance/local-evidence scope are resolved.
- Runtime evidence inventory is materialized. It is metadata-only and excludes `_bmad/memory/knx/runtime/runtime-inventory/**` to avoid self-inclusion.
- Gate flow: for hard gates, present summary and why gated, execute after approval, then immediately present the next gate details.
- Default-proceed local workflow is accepted: eligible local KNX governance/evidence/validation/packaging/handoff/local commit work should proceed without per-step user interaction. Hard gates still stop for explicit approval.
- `ksev` public-distribution readiness planning is active. Current manifest remains local-only; distribution metadata posture is accepted.
- Company commercial licensing posture is accepted for planning: keep KNX and `ksev` private/local and `UNLICENSED` to preserve a future private commercial license path.
- Company evaluation access protocol is accepted for planning: no sharing, access, demo, repository access, or rights grant is approved.
- Evaluation candidate packet scope is accepted for planning: first packet is documentation-only and local-only.
- Local evaluation packet draft is materialized and hardened under approved runtime storage. It remains local-only and not approved for sharing.
- External discussion-guide scope is accepted for planning, but the company-facing discussion path is parked at user request. The local guide draft remains local-only and unshared. IDE one-click action planning is closed. Current recommended next workflow is the approved local-only greenfield implementation lane.
- Current KNX work is reopened only for the approved local-only greenfield implementation lane. Parked and hard-gated paths remain closed unless explicitly reopened. Operational source packets remain hard-gated.
- Current local implementation runway is materialized under `runtime/greenfield-implementation/`.
- `ksev` is registered in shared local config and help registry.
- Current hard-gate planning sequence is complete for Gates 1-11 in `runtime/greenfield-implementation/hard-gate-workthrough-plan-2026-06-01.md`.
- Local writes are approved for scoped KNX module/config/help/report paths listed in `decisions/write-boundary-knx-local-2026-06-01.md`.
- Metadata-only inventory for approved KNX implementation paths is materialized under `runtime/greenfield-implementation/inventory/`.
- `ksev` public distribution readiness planning is materialized locally under `runtime/greenfield-implementation/distribution-readiness/`; publication remains blocked.
- GitHub/remote readiness planning is materialized locally under `runtime/greenfield-implementation/remote-readiness/`; remotes remain disabled.
- Company evaluation planning is materialized locally under `runtime/greenfield-implementation/company-evaluation/`; sharing remains blocked.
- IDE/workspace planning is materialized locally under `runtime/greenfield-implementation/ide-workspace/`; IDE and workspace writes remain disabled.
- Runtime assistant behavior planning is materialized locally under `runtime/greenfield-implementation/runtime-behavior/`; runtime behavior remains disabled.
- Local model/GPU processing planning is materialized locally under `runtime/greenfield-implementation/local-model-gpu/`; model/GPU processing remains disabled.
- Access/security workflow planning is materialized locally under `runtime/greenfield-implementation/access-security/`; customer/production/credential/account-security workflows remain blocked.
- Destructive/risk-waiver planning is materialized locally under `runtime/greenfield-implementation/destructive-risk/`; destructive/data-loss actions and risk score `9` waivers remain blocked.
- Post-gate continuation plan is materialized locally under `runtime/greenfield-implementation/post-gate-continuation-2026-06-01.md`; the scoped implementation evidence baseline was refreshed on 2026-06-02. Next routing should continue concrete local KNX/ksev implementation and validation work.

## Active Boundaries

- Approved storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`
- Approved source root: `C:/Users/slaw_dawg/Kendall_Nxt`
- Approved source operation: read/planning only.
- Local Git staging and local commits are approved for scoped KNX governance and validator work.
- Source mutation, broader or operational source inventory generation, GitHub/remotes, external providers, local model/GPU processing, customer/production access, credentials, account/security workflows, runtime assistant behavior, and public distribution remain blocked unless separately approved.
