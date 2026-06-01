# Governance Coordinator Decision - KendallAI vNext

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: include `knx-agent-governance-coordinator` in the KNX governance core as the front-door routing workflow.

## Current Phase

Phase: governance core scaffolded and validated; optional source/evidence validator scaffolded, validated, and held local-only; operational packs deferred.

The governance foundation has profile, execution policy, data-boundary, mature-tool, source/evidence, safety-review, and module-strategy records. The KNX governance core is scaffolded and validated. The optional `ksev` source/evidence validator pack is scaffolded and validated as local installable packaging evidence, not public distribution.

## Coordinator Mission

Route KendallAI vNext work through explicit governance decisions before implementation, packaging, source intake, external sends, source mutation, or runtime deployment choices.

The coordinator is not the runtime assistant. It is the governance front door.

## Routing Rules

| Situation | Route |
| --- | --- |
| No install profile or memory index exists | `knx-profile-setup` |
| Execution path, cost, provider, local model, or GPU policy is unclear | `knx-execution-policy` |
| Storage, source classes, processing locations, or forbidden destinations are unclear | `knx-data-boundary-plan` |
| Mature tool, platform workflow, package, or custom-code decision is being considered | `knx-mature-tool-review` |
| Source packet, work trace, validation evidence, user-input-required item, or fixture contract is needed | `knx-source-evidence-contract` |
| Planned skill, workflow, module, optional pack, or operational workflow needs safety/evidence review | `knx-safety-validation-review` |
| Module boundaries, optional packs, or Create Module readiness are unclear | `knx-module-strategy` |
| Governance core is selected and strategy is not blocked | `bmad-module-builder` Create Module |

## Stop Conditions

Do not route to implementation or release-ready packaging when the requested work depends on unresolved:

- Storage root.
- Allowed source roots.
- Source mutation approval.
- External-provider approval.
- Credential, account/security, customer, or production access.
- Git/GitHub boundary.
- Local model or GPU availability.
- Data-loss or destructive-action approval.
- Safety validation for the target pack or workflow.

## Current Strongest Recommendation

Recommended next workflow: route by concrete capability rather than continuing scaffolding.

Why it is next:

- The KNX governance core has already been scaffolded and validated.
- The optional `ksev` validator pack has already been scaffolded, validated, safety-reviewed, and marked local-only.
- The remaining work depends on which capability is requested next.

Scope limit:

- Do not continue packaging work without a concrete target capability.
- Do not package source inventory generation, operational source intake, runtime assistant state, external providers, GitHub automation, local model/GPU workflows, Microsoft 365/OneDrive/sync integrations, credentials, account/security, customer systems, or production systems.

## Current Routing

- Use `knx-source-evidence-contract` for fixture, source packet, evidence, traceability, or validation-evidence contract changes.
- Use `knx-mature-tool-review` before any source inventory materialization workflow or new dependency/tool decision.
- Use `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, operational source intake, or expanded data access.
- Use `knx-module-strategy` only when packaging boundaries change.
- Use `bmad-module-builder` only when a specific module packaging or validation target is named.

## Expected Output Artifact

Expected next artifact: depends on the requested capability. For the current state, routing records and validation reports are the durable handoff artifacts.

## Readiness

Recommendation readiness: ready for local governance-core use and local `ksev` validator use; deferred for public distribution and operational packs.

Blocked or deferred:

- Public validator distribution remains deferred until owner, license, homepage, repository, release channel, safety target, and publication mechanism are explicitly decided.
- Source inventory generation remains deferred.
- Operational packs remain deferred until their boundaries, mature-tool reviews, source/evidence fixtures, and safety reviews exist.

## Decision Sources

- Routing map: `knx-agent-governance-coordinator` workflow.
- Current phase: module strategy, safety review, validator implementation target, validator distribution decision, and module validation reports.
- Stop conditions: profile, execution policy, data-boundary plan, and source/evidence contract.
- Next recommendation: latest module strategy plus validator distribution decision.
