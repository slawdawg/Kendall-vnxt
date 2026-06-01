# Module Strategy - KendallAI vNext

Last updated: 2026-06-01

## Strategy Status

Status: accepted for governance core; provisional for optional packs

Reason: governance workflows can be packaged as a reusable core. Storage root, read/planning source root, local Git source/review boundary, GitHub/remote disablement, and per-use external-provider policy are now recorded. Optional source/evidence pack planning is accepted, and validator prototype evidence is mature enough to start installable optional-pack packaging. Optional pack release remains provisional because source mutation, GitHub/remotes, local model/runtime availability, GPU/local accelerator availability, external-provider sends, concrete source inventory artifacts, and operational source intake remain unresolved or unapproved.

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
- Local source inventory evidence for read/planning.
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
- `_bmad/memory/knx/decisions/safety-review-2026-06-01.md`
- `_bmad/memory/knx/decisions/mature-tool-source-inventory-2026-06-01.md`
- `_bmad/memory/knx/decisions/source-evidence-contract-2026-06-01.md`

Missing input:

- `skills/reports/kendallai-vnext-module-plan.md` was not found.

## Packaging Options Considered

| Option | Fit | Risks | Decision |
| --- | --- | --- | --- |
| Single `knx` governance module | Simple install and clear starting point | Can become too broad if runtime packs are added to core | Accept as governance core only |
| `knx` governance core plus optional packs | Best fit for installability, safety gates, and future expansion | Requires clear split criteria and separate safety reviews for packs | Recommended |
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

Source inventory evidence is not part of the governance core implementation. It belongs in a future optional source/evidence pack after materialized inventory evidence, validation evidence, work trace, and fixture coverage exist.

Optional source/evidence pack packaging is now the accepted next lane for the validator capability only. The pack must stay separate from governance core. Source inventory generation, source mutation, operational source intake, external sends, GitHub/remotes, local model/GPU processing, customer/production access, credentials, account/security workflows, and runtime assistant behavior remain out of scope.

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
- Local source inventory evidence pack.
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

Accepted next optional pack lane:

- Name: KNX optional source/evidence pack.
- Purpose: provide deterministic local validation and evidence handling for source packets, fixture packs, validation evidence, work traces, and read/planning-only source inventory evidence.
- Initial scope for packaging: dependency-free fixture/evidence validator, source/evidence contract checks, source mutation approval checks, approved-storage-root checks for referenced inventory artifact paths, validator run evidence bundles, and synthetic fixture validation evidence.
- Explicitly out of scope for the pack until later decisions: source mutation, GitHub/remotes, external providers, local model/GPU classification, customer/production data, credentials, account/security workflows, runtime assistant behavior, and writes outside approved storage.
- Split trigger basis: the pack has different implementation behavior, validation artifacts, and optional dependencies than governance core, but can provide independent value for future validators and evidence checks.

Accepted optional-pack prototype evidence:

- Prototype path: `_bmad/memory/knx/runtime/optional-source-evidence-pack`.
- Validator script: `scripts/validate_source_evidence.py`.
- Test suite: `tests/test_validate_source_evidence.py`.
- Validator report: `reports/source-evidence-validation.json` and `reports/source-evidence-validation.md`.
- Validator run evidence bundle: `evidence/validator-run-2026-06-01.json`.
- Latest validator result: `PASS`, 14 fixtures, 0 errors, 0 warnings.
- Test result: 10 stdlib tests passed.
- Storage root handling: config-derived from `knx_storage_root` with explicit CLI override for test/review scenarios.

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

- Real source packet creation for project files beyond read/planning contract descriptions.
- Materialized source inventory artifacts until a pack-specific work trace, validation evidence record, and safety review exist.
- Source indexing and search beyond deterministic inventory.
- Additional validators or schema-check scripts beyond the current fixture/evidence validator until a separate mature-tool review and safety review exist.
- Git/GitHub automation.
- Local model or GPU-backed workflows.
- External LLM/provider workflows.
- OneDrive, Microsoft 365, sync-provider, or app-data storage choices.
- Runtime/live assistant state packaging.

Required evidence before acceptance:

- Storage root decision. Completed for local KNX runtime storage.
- Allowed source roots and permitted operations. Completed for `C:/Users/slaw_dawg/Kendall_Nxt` read/planning only.
- Data-boundary expansion decision.
- Mature-tool review for the specific capability.
- Source/evidence fixture coverage.
- Safety validation review for the candidate pack.

Completed evidence for optional pack planning:

- Synthetic fixture pack expanded to include source mutation without approval and source inventory outside approved storage negative cases.
- Expanded fixture pack safety review completed with concerns and no blockers for fixture and future-validator testing.
- Governance-core module validation rerun after expanded fixture coverage: pass, 0 findings.
- Optional source/evidence validator prototype implemented under approved runtime storage.
- Standalone synthetic validation evidence examples materialized for referenced negative validation evidence IDs.
- Validator run evidence bundle created.
- Validator storage root generalized through config-derived lookup with CLI override.
- Validator result: PASS, 14 fixtures, 0 errors, 0 warnings.
- Validator tests: 10 passed.

## Build Order

1. Finalize governance coordinator behavior and routing.
2. Normalize core skill names, descriptions, and handoffs.
3. Package governance core as an installable KNX module.
4. Add reusable memory templates and synthetic fixture README.
5. Run safety validation against the packaged core.
6. Keep source inventory evidence as an optional pack candidate, not core.
7. Expand synthetic fixtures for the new source-inventory negative categories. Completed on 2026-06-01.
8. Plan the optional source/evidence pack boundary and validator scope. Completed on 2026-06-01.
9. Run mature-tool review for deterministic validator implementation options before writing validator code. Completed on 2026-06-01.
10. Run safety validation against the optional pack plan. Completed on 2026-06-01.
11. Implement local prototype validator under approved runtime storage. Completed on 2026-06-01.
12. Harden validator evidence, config-derived storage root, and edge tests. Completed on 2026-06-01.
13. Package the validator capability as an installable optional source/evidence pack.
14. Validate the optional pack module structure.
15. Run safety validation against the packaged optional pack.
16. Defer materialized source inventory evidence until a separate workflow records work trace, validation evidence, and safety review.

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

Before optional packs can be planned:

- Keep the optional pack separate from governance core.
- Name the target artifacts, validation checks, and storage paths.
- Confirm the pack uses deterministic local processing and mature local tools first.
- Keep source mutation, external sends, GitHub/remotes, local model/GPU processing, credentials, account/security, customer/production, and runtime assistant behavior out of scope.

Before optional source/evidence validator pack can be scaffolded:

- Keep the pack separate from governance core.
- Use config-derived storage root resolution.
- Include only dependency-free stdlib validator tooling, tests, synthetic fixtures, and evidence templates.
- Do not include source inventory generation or operational source intake.

Before optional packs can be released:

- Complete data-boundary expansion for the pack.
- Complete mature-tool review for pack dependencies.
- Add source/evidence fixtures.
- Create source inventory evidence, validation evidence, and work trace when the pack handles inventory.
- Run safety validation with concrete target artifacts.

## Create Module Readiness

Readiness: governance core is scaffolded and validated; optional source/evidence validator pack is scaffolded, validated, safety-reviewed, and held as local installable packaging evidence.

Ready enough for:

- Maintaining `knx-agent-governance-coordinator` as the front-door router.
- Using the governance-core module locally.
- Using the optional source/evidence validator pack locally against synthetic fixture packs.
- Planning a separate optional source/evidence pack when a concrete consuming workflow exists.
- Revalidating module manifests and templates after scoped edits.

Not ready for:

- Packaging source inventory evidence as a release-ready optional pack.
- Packaging source inventory generation in the validator pack.
- Packaging operational source intake.
- Packaging runtime assistant state.
- Packaging external provider, GitHub, Microsoft 365, OneDrive, local model, GPU, customer, production, credential, or account/security workflows.
- Public distribution of `ksev` without an explicit owner, license, homepage, repository, release channel, safety target, and publication mechanism decision.

## Open Questions

1. Which source classes should the first real source packets cover?
2. Who can approve risk score `9` waivers?
3. Should Git/GitHub remain outside KNX for now or become a later optional pack?
4. Should inventory artifacts be materialized only after a consuming workflow needs them?
5. Should `ksev` remain local-only indefinitely or receive a later public distribution decision?

## Optional Validator Pack Packaging Result

Packaging workflow: `bmad-module-builder` Create Module.

Result: accepted as a separate standalone optional module.

Packaged module:

- Module code: `ksev`
- Module name: KNX Source Evidence Validator
- Skill path: `.agents/skills/knx-source-evidence-validator`
- Marketplace manifest: `.agents/skills/.claude-plugin/marketplace.json`
- Validation report: `skills/reports/module-validation-ksev-2026-06-01.md`

Packaged scope:

- Dependency-free synthetic source/evidence fixture validation.
- Validator tests.
- Standalone self-registration assets.
- Local report writing under approved KNX runtime storage.

Explicitly excluded:

- Source inventory generation.
- Operational source intake.
- Source mutation.
- GitHub/remotes.
- External providers.
- Local model/GPU processing.
- Customer/production access.
- Credentials and account/security workflows.
- Runtime assistant behavior.
- Changes to the KNX governance core module.

Verification:

- Packaged unit tests: 10 passed.
- Packaged validator result: PASS, 14 fixtures, 0 errors, 0 warnings.
- BMad module validation: pass, 0 findings.

## Recommended Next Workflow

Recommended next workflow: route by concrete capability.

Use:

- `knx-source-evidence-contract` for fixture, source packet, evidence, traceability, or validation-evidence contract changes.
- `knx-mature-tool-review` before any source inventory materialization workflow or new dependency/tool decision.
- `knx-safety-validation-review` before any new optional pack, public release path, external send, source mutation, operational source intake, or expanded data access.
- `bmad-module-builder` only when a specific module packaging or validation target is named.

Reason: governance core scaffolding, optional validator scaffolding, module validation, packaged-pack safety review, and local-only metadata cleanup are complete.

## Optional Validator Pack Metadata Result

Result: accepted for local-only packaging evidence.

Updated manifest: `.agents/skills/.claude-plugin/marketplace.json`

Recorded metadata:

- owner: `KendallAI vNext local`
- author: `KendallAI vNext local`
- license: `UNLICENSED`
- homepage: `local-only`
- repository: `local-only`

Distribution status: not public-release ready. Public distribution requires a later explicit decision naming owner, repository, homepage, and license.

Durable distribution decision: `validator-distribution-2026-06-01.md`.

## Decision Sources

- Strategy status: safety-review-derived, data-boundary-derived, mature-tool-review-derived, and source-evidence-contract-derived.
- Recommended module shape: defaulted from KNX module strategy workflow and confirmed by current governance constraints.
- Initial module contents: built KNX workflow inventory and governance sequence.
- Deferred capabilities: profile-derived, execution-policy-derived, data-boundary-derived, source/evidence-contract-derived, mature-tool-review-derived, and safety-review-derived.
- Build order: local strategy review.
- Create Module readiness: safety-review-derived.
