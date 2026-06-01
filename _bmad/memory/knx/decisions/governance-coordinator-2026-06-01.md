# Governance Coordinator Decision - KendallAI vNext

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: include `knx-agent-governance-coordinator` in the KNX governance core as the front-door routing workflow.

## Current Phase

Phase: governance core ready for module scaffolding, with operational packs deferred.

The governance foundation has profile, execution policy, data-boundary, mature-tool, source/evidence, safety-review, and module-strategy records. The safety review found concerns but no blockers for governance-foundation planning.

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

Recommended next workflow: `bmad-module-builder` Create Module for the KNX governance core.

Why it is next:

- `knx-module-strategy` selected a governance core plus optional packs.
- `knx-agent-governance-coordinator` is now accepted as the front-door router for that core.
- Safety review found no blockers for governance-foundation planning.

Scope limit:

- Create Module should package only the governance core.
- Do not package operational source intake, runtime assistant state, external providers, GitHub automation, local model/GPU workflows, Microsoft 365/OneDrive/sync integrations, credentials, account/security, customer systems, or production systems.

## Required Inputs For Create Module

- Core workflow list from `module-strategy-2026-05-31.md`.
- Conservative config keys from the module strategy.
- Memory template list from the module strategy.
- Safety review concerns from `safety-review-2026-05-31.md`.
- Source/evidence contract and synthetic fixture README.

## Expected Output Artifact

Expected next artifact: an installable KNX governance-core module scaffold or module-builder output, plus a follow-up safety review of the packaged core.

## Readiness

Recommendation readiness: ready for governance-core scaffolding; provisional for release readiness.

Blocked or deferred:

- Optional packs remain deferred until their boundaries, mature-tool reviews, source/evidence fixtures, and safety reviews exist.

## Decision Sources

- Routing map: `knx-agent-governance-coordinator` workflow.
- Current phase: module strategy and safety review.
- Stop conditions: profile, execution policy, data-boundary plan, and source/evidence contract.
- Next recommendation: module strategy plus accepted coordinator decision.
