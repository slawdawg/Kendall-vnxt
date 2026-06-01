# Module Strategy - KendallAI vNext

Last updated: 2026-05-31

## Strategy Status

Status: provisional

Reason: governance workflows can be packaged as a reusable core, but storage root, allowed source roots, Git/GitHub boundary, local model/runtime availability, external-provider policy, and concrete fixtures remain unresolved.

## Capabilities Reviewed

Governance foundation capabilities:

- Profile setup.
- Execution policy.
- Data-boundary planning.
- Mature-tool review.
- Source/evidence contract.
- Safety validation review.
- Module strategy.
- Governance coordination.

Optional or downstream capabilities considered:

- Source evidence packet creation and validation.
- Synthetic fixture packs.
- Local validators or schema checks.
- Git/GitHub source-review workflow.
- Runtime assistant state storage.
- Local model or GPU-backed processing.
- External-provider integration.
- Product/runtime assistant behavior.

Inputs read:

- `_bmad/memory/knx/profile.md`
- `_bmad/memory/knx/execution-policy.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/tool-evaluation.md`
- `_bmad/memory/knx/decisions/safety-review-2026-05-31.md`

Missing input:

- `skills/reports/kendallai-vnext-module-plan.md` was not found.

## Packaging Options Considered

| Option | Fit | Risks | Decision |
| --- | --- | --- | --- |
| Single `knx` governance module | Simple install and clear starting point | Can become too broad if runtime packs are added to core | Accept as governance core only |
| `knx` governance core plus optional packs | Best fit for installability, safety gates, and future expansion | Requires clear split criteria | Recommended |
| Multiple independent BMad modules | Useful later if packs serve different audiences or dependencies | Premature split before operational capabilities are proven | Deferred |
| Ordinary project code plus a few BMad workflows | Good for product/runtime behavior | Weak reusable governance packaging | Use only for runtime/product code |
| Hybrid Builder modules plus ordinary runtime code | Best long-term shape when reusable governance and product runtime diverge | Requires later boundary decisions | Recommended future shape |

## Recommended Module Shape

Use `knx` governance core plus optional packs.

Core module purpose:

- Installable local-first governance workflows.
- Setup, policy, boundary, evidence, review, and strategy contracts.
- No live runtime state.
- No source-system access.
- No external sends.
- No hard dependency on Bob-specific paths, OneDrive, Microsoft 365, GitHub, GPU, local model runtimes, or external providers.

Optional packs should be added only when their dependencies, data boundaries, approval gates, and mature-tool reviews are explicit.

## Initial Module Contents

Initial `knx` governance core should include:

- `knx-profile-setup`
- `knx-execution-policy`
- `knx-data-boundary-plan`
- `knx-mature-tool-review`
- `knx-source-evidence-contract`
- `knx-safety-validation-review`
- `knx-module-strategy`
- `knx-agent-governance-coordinator`

Initial reusable memory templates should include:

- `profile.md`
- `execution-policy.md`
- `data-boundaries.md`
- `tool-evaluation.md`
- `source-evidence-contract.md`
- `daily/YYYY-MM-DD.md`
- `decisions/`
- `fixtures/synthetic/README.md`

## Optional Packs And Split Triggers

Candidate optional packs:

- Source packet and evidence validation pack.
- Synthetic fixture generation pack.
- Git/GitHub review integration pack.
- Local model/runtime pack.
- External-provider policy pack.
- Microsoft 365 or sync-provider pack.
- Runtime assistant state/storage pack.

Split a pack out of core when it:

- Requires a dependency or account not needed by governance core.
- Uses different source classes, storage destinations, or approval gates.
- Serves a different install profile or audience.
- Has independent value without the rest of KNX.
- Would make setup, help, validation, or maintenance confusing inside core.

## Capabilities That Should Remain Ordinary Project Code

Keep these outside the reusable governance module unless later evidence proves they are reusable and safe:

- Product/runtime assistant behavior.
- Live deployment code.
- Storage adapters for a specific app or environment.
- Customer, production, email/calendar, credential, or account/security integrations.
- UI/runtime orchestration.
- Source-specific importers tied to one local project.
- Model-provider client code.

## Capabilities Deferred Until Evidence Exists

Deferred:

- Real source packet creation for project files.
- Source indexing and search.
- Concrete validators or schema-check scripts.
- Git/GitHub automation.
- Local model or GPU-backed workflows.
- External LLM/provider workflows.
- OneDrive, Microsoft 365, sync-provider, or app-data storage choices.
- Runtime/live assistant state packaging.

Required evidence before acceptance:

- Storage root decision.
- Allowed source roots and permitted operations.
- Data-boundary expansion decision.
- Mature-tool review for the specific capability.
- Source/evidence fixture coverage.
- Safety validation review for the candidate pack.

## Build Order

1. Finalize governance coordinator behavior and routing.
2. Normalize core skill names, descriptions, and handoffs.
3. Package governance core as an installable KNX module.
4. Add reusable memory templates and synthetic fixture README.
5. Run safety validation against the packaged core.
6. Create concrete synthetic fixtures.
7. Review and build optional packs one at a time.

## Setup And Config Implications

Core config should support:

- `knx_user_label`
- `knx_storage_mode`
- `knx_storage_root`
- `knx_repo_remote`
- `knx_local_compute_policy`
- `knx_external_llm_policy`
- `knx_gpu_available`
- `knx_allowed_source_roots`
- `knx_forbidden_destinations`
- `knx_approval_policy`

Defaults must stay conservative:

- Local-first.
- External-provider-last.
- No sends without approval or policy.
- No source mutation without approval or policy.
- No credentials, account/security, customer, or production access.
- No live runtime state outside approved storage.

## Safety Validation Prerequisites

Before core packaging can be treated as release-ready:

- Confirm the core does not assume Bob-specific paths.
- Confirm optional dependencies are not hidden inside core.
- Confirm every workflow records unresolved storage/source/provider decisions instead of guessing.
- Confirm no workflow creates live runtime state.
- Confirm no workflow sends externally, accesses credentials, or mutates source systems.
- Confirm generated outputs link to source/evidence contracts where applicable.

Before optional packs can be released:

- Complete data-boundary expansion for the pack.
- Complete mature-tool review for pack dependencies.
- Add source/evidence fixtures.
- Run safety validation with concrete target artifacts.

## Create Module Readiness

Readiness: provisional-ready for governance core planning, not release-ready for operational packs.

Ready enough for:

- Building or refining `knx-agent-governance-coordinator`.
- Preparing governance-core module scaffolding.
- Drafting module manifest and templates.

Not ready for:

- Packaging operational source intake.
- Packaging runtime assistant state.
- Packaging external provider, GitHub, Microsoft 365, OneDrive, local model, GPU, customer, production, credential, or account/security workflows.

## Open Questions

1. Should `knx-agent-governance-coordinator` be included in core as the front-door router?
2. What storage root should be approved for live/generated artifacts?
3. Which source roots are approved and what operations are allowed?
4. Should Git/GitHub be an optional pack or remain outside KNX for now?
5. Should concrete synthetic fixtures be created before module scaffolding?
6. What name/version/manifest format should the Create Module step use?

## Recommended Next Workflow

Recommended next workflow: `knx-agent-governance-coordinator`.

Reason: a coordinator is useful as the safe front door for routing users through setup, policy, boundary, evidence, safety, and optional-pack decisions without assuming unresolved runtime capabilities.

After the coordinator is defined, use `bmad-module-builder` Create Module for the governance core.

## Decision Sources

- Strategy status: safety-review-derived and data-boundary-derived.
- Recommended module shape: defaulted from KNX module strategy workflow and confirmed by current governance constraints.
- Initial module contents: built KNX workflow inventory and governance sequence.
- Deferred capabilities: profile-derived, execution-policy-derived, data-boundary-derived, source/evidence-contract-derived, mature-tool-review-derived.
- Build order: local strategy review.
- Create Module readiness: safety-review-derived.
