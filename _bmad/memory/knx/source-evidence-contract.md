# KNX Source Evidence Contract

Last updated: 2026-06-01

## Contract Status

Status: provisional

Reason: the artifact contracts are defined, the storage root is approved, and the approved source root may be used for read/planning workflows. The contract remains provisional because source mutation, GitHub/remote workflows, local model runtime, GPU/local accelerator processing, and external-provider sends remain unapproved unless separately approved.

## Artifact List And Purpose

| Artifact | Purpose | Storage status |
| --- | --- | --- |
| Source packet | Declares approved source material, support level, processing boundary, and allowed downstream use | Provisional; setup examples only under `_bmad/memory/knx` |
| Work trace | Human-readable provenance for actions taken, tools used, assumptions, uncertainty, and next action | Provisional; allowed under `_bmad/memory/knx` |
| Validation evidence | Machine-readable or structured result record for checks, risk, blocking status, and waiver state | Provisional; allowed under `_bmad/memory/knx` |
| User-input-required item | Explicit blocker or human decision request when automation cannot proceed safely | Provisional; allowed under `_bmad/memory/knx` |
| Decision record | Governance decision with accepted, rejected, deferred, blocked, or waived outcome and rationale | Allowed under `_bmad/memory/knx/decisions` |
| Source inventory evidence | Deterministic inventory summary for approved read/planning source roots | Allowed under approved storage root |
| Fixture pack | Synthetic valid and negative examples for future validation | Allowed only under `_bmad/memory/knx/fixtures/synthetic` |
| Output metadata | Links generated outputs to source packets, traces, validation evidence, and decisions | Provisional; allowed under `_bmad/memory/knx` or approved storage root |
| Validator run evidence bundle | Links optional-pack validator reports to work trace, validation evidence, output metadata, and boundary flags | Provisional; allowed under approved storage root |

## Required Fields

### Source Packet

- `source_packet_id`: stable local identifier.
- `title`: short human-readable label.
- `source_class`: one of the data-boundary source classes.
- `source_location_or_description`: approved path, reference, or description; no credentials or secrets.
- `source_owner_or_provider`: user, project, public, synthetic, or unresolved.
- `approval_basis`: user-specified, profile-derived, data-boundary-derived, decision-record, public, synthetic, or unresolved.
- `source_support_level`: direct, indirect, user-asserted, synthetic, inferred, unsupported, or unresolved.
- `permitted_processing_boundary`: deterministic-local, mature-local-tool, approved-local-model, approved-custom-glue, approved-external-provider, or unresolved.
- `permitted_storage_boundary`: `_bmad/memory/knx`, approved-storage-root, synthetic-fixture-folder, or unresolved.
- `downstream_allowed_use`: planning, draft-generation, validation, fixture-test, decision-support, or blocked.
- `source_operation`: read-planning, mutation-requested, mutation-approved, external-send-requested, or blocked.
- `uncertainty`: none, low, medium, high, or blocking.
- `forbidden_content_check`: pass, concerns, fail, or not-run.
- `created_at`: ISO date.
- `created_by`: user, KNX workflow, or other local actor.
- `source_references`: list of local references or descriptions.
- `open_questions`: list.

### Work Trace

- `work_trace_id`: stable local identifier.
- `trigger`: user request, workflow, scheduled review, or manual update.
- `source_packet_ids`: list.
- `generated_artifact_ids`: list.
- `validation_evidence_ids`: list.
- `decision_record_ids`: list.
- `steps_taken`: ordered list.
- `tools_used`: local tools, KNX skills, mature tools, or approved exceptions.
- `execution_layer`: 1, 2, 3, 4, or 5 from the execution policy.
- `assumptions`: list.
- `uncertainty`: none, low, medium, high, or blocking.
- `residual_risk`: none, low, medium, high, or blocking.
- `next_action`: proceed, validate, request-user-input, create-decision, defer, or block.
- `created_at`: ISO date.

### Validation Evidence

- `validation_evidence_id`: stable local identifier.
- `artifact_under_validation`: source packet, output, work trace, decision, fixture, or policy file.
- `validation_type`: boundary-check, source-support-check, contract-check, fixture-check, policy-check, manual-review, or other.
- `result`: PASS, CONCERNS, FAIL, or WAIVED.
- `failed_rules`: list.
- `risk_score`: integer 0 through 9.
- `blocking_status`: nonblocking, blocking, waived-blocking, or not-applicable.
- `evidence_references`: source packets, commands, checks, files, or manual review notes.
- `command_or_check_run`: command/check name or not-run.
- `waiver_id`: decision record ID or none.
- `waiver_reason`: required when result is WAIVED.
- `reviewer`: user, KNX workflow, or named reviewer.
- `created_at`: ISO date.

### User-Input-Required Item

- `user_input_required_id`: stable local identifier.
- `decision_needed`: concrete human decision.
- `why_automation_cannot_proceed`: safety, boundary, missing approval, ambiguity, missing source, or risk.
- `source_references`: list.
- `allowed_choices`: list when known.
- `blocked_downstream_work`: list.
- `risk_if_guessed`: low, medium, high, or blocking.
- `due_or_review_condition`: optional.
- `status`: open, answered, deferred, or closed.
- `created_at`: ISO date.

### Decision Record

- `decision_record_id`: stable local identifier.
- `decision_type`: profile, execution-policy, data-boundary, mature-tool, custom-code, source-evidence-contract, safety-validation, or exception.
- `status`: accepted, rejected, deferred, blocked, waived, or superseded.
- `decision`: concise decision statement.
- `rationale`: why this decision was made.
- `scope`: what it applies to.
- `approval_basis`: user-specified, profile-derived, execution-policy-derived, data-boundary-derived, tool-review-derived, defaulted, or unresolved.
- `source_references`: list.
- `risk_score`: integer 0 through 9.
- `expiration_or_review_condition`: optional.
- `supersedes`: optional list.
- `created_at`: ISO date.

### Fixture Pack

- `fixture_pack_id`: stable local identifier.
- `fixture_type`: valid-source-packet, valid-work-trace, valid-validation-evidence, valid-user-input-required, missing-source-negative, external-action-negative, unsupported-inference-negative, forbidden-destination-negative.
- `synthetic_only_statement`: required.
- `artifact_ids`: list.
- `expected_validation_result`: PASS, CONCERNS, FAIL, or WAIVED.
- `expected_failed_rules`: list.
- `forbidden_content_check`: pass, concerns, fail, or not-run.
- `created_at`: ISO date.

### Source Inventory Evidence

- `source_inventory_id`: stable local identifier.
- `source_root`: approved source root path.
- `source_root_approval_basis`: user-specified, data-boundary-derived, decision-record, or unresolved.
- `inventory_scope`: tracked-files, visible-files, extension-summary, source-class-summary, or mixed.
- `allowed_operation`: read-planning only unless a later decision approves more.
- `inventory_tool`: git, ripgrep, PowerShell, or approved-custom-glue.
- `inventory_command_or_check`: exact command/check name or not-run.
- `excluded_paths_or_patterns`: list.
- `file_count`: integer or unresolved.
- `top_file_groups`: list when available.
- `generated_artifact_path`: approved local path or not-materialized.
- `forbidden_content_check`: pass, concerns, fail, or not-run.
- `boundary_check_result`: PASS, CONCERNS, FAIL, or WAIVED.
- `source_mutation_performed`: must be false unless separately approved.
- `external_send_performed`: must be false unless separately approved.
- `uncertainty`: none, low, medium, high, or blocking.
- `created_at`: ISO date.
- `created_by`: user, KNX workflow, or other local actor.

### Output Metadata

- `output_artifact_id`: stable local identifier.
- `output_type`: draft, review-package, report, plan, decision-support, fixture-output, or other.
- `source_packet_ids`: list.
- `work_trace_id`: required.
- `validation_evidence_ids`: list.
- `decision_record_ids`: list when applicable.
- `generation_boundary`: deterministic-local, mature-local-tool, approved-local-model, approved-custom-glue, approved-external-provider, or unresolved.
- `storage_location`: approved local path or unresolved.
- `storage_boundary_basis`: `_bmad/memory/knx`, approved-storage-root, synthetic-fixture-folder, decision-record, or unresolved.
- `source_support_summary`: direct, indirect, user-asserted, synthetic, inferred, unsupported, or mixed.
- `uncertainty`: none, low, medium, high, or blocking.
- `result_status`: draft, ready-for-review, validated, blocked, or superseded.
- `created_at`: ISO date.

### Validator Run Evidence Bundle

- `evidence_bundle_id`: stable local identifier.
- `title`: short human-readable label.
- `created_at`: ISO date.
- `created_by`: user, KNX workflow, or other local actor.
- `synthetic_only_statement`: required when the run validates synthetic fixtures.
- `work_trace`: embedded or linked work trace.
- `validation_evidence`: embedded or linked validation evidence for the run.
- `output_metadata`: list of output metadata records for generated reports.
- `boundaries`: flags for source mutation, external send, source inventory materialization, package install, and runtime assistant behavior.

## Controlled Status Vocabulary

- Contract status: complete, provisional, blocked.
- Decision status: accepted, rejected, deferred, blocked, waived, superseded.
- Work status: proceed, validate, request-user-input, create-decision, defer, block.
- User-input status: open, answered, deferred, closed.
- Output status: draft, ready-for-review, validated, blocked, superseded.
- Blocking status: nonblocking, blocking, waived-blocking, not-applicable.

## Source Support And Uncertainty

Required source-support vocabulary:

- `direct`: explicit source directly supports the claim or output.
- `indirect`: source supports context but not the full claim.
- `user-asserted`: user provided the claim but no independent source was checked.
- `synthetic`: generated safe example, not real source material.
- `inferred`: reasoned from available material and must be labeled.
- `unsupported`: no adequate source support.
- `unresolved`: source support has not been determined.

Required uncertainty vocabulary:

- `none`: no known uncertainty.
- `low`: minor uncertainty that does not affect use.
- `medium`: material uncertainty requiring review.
- `high`: significant uncertainty; do not treat as validated.
- `blocking`: automation must stop or request input.

Generated outputs must not be treated as trusted unless they link to source packets, a work trace, and validation evidence.

## Required Link Rules

- Every generated output must link to at least one source packet, one work trace, and one validation evidence record.
- Every materialized source inventory must link to a validation evidence record and the mature-tool decision that approved the inventory method.
- Every work trace must list source packet IDs, generated artifact IDs, validation evidence IDs, and decision record IDs when decisions affect the work.
- Every validation evidence record must identify the artifact under validation and evidence references.
- Every waiver must link to a decision record with rationale and scope.
- Every user-input-required item must identify blocked downstream work.
- Every decision record must list source references or state why the decision is defaulted or unresolved.
- Every fixture must state that it is synthetic only and must live under `_bmad/memory/knx/fixtures/synthetic`.
- Every artifact written outside `_bmad/memory/knx` must cite the approved storage root or a later storage-boundary decision.
- Every validator-generated report must link to a work trace, validation evidence, and output metadata record.
- Every validator run evidence bundle must state whether source mutation, external sends, source inventory materialization, package installs, or runtime assistant behavior occurred.

## Validation Result Vocabulary

- `PASS`: checks met the contract and no blocking issue remains.
- `CONCERNS`: checks completed but nonblocking issues, uncertainty, or residual risk remain.
- `FAIL`: one or more required checks failed and the artifact is not approved.
- `WAIVED`: a blocking or failed condition was explicitly waived by a recorded decision.

## Risk Scoring Rule

Risk score is an integer from 0 through 9:

- 0: no known risk.
- 1-2: low risk.
- 3-5: medium risk.
- 6-8: high risk.
- 9: blocking risk.

Score `9` is blocking unless explicitly waived by a decision record. A waiver must record rationale, scope, approval basis, and review condition.

## Negative Fixture Categories

The first synthetic fixture pack should include:

- Minimal valid source packet.
- Minimal valid work trace.
- Minimal valid validation evidence.
- Minimal valid user-input-required item.
- Missing source negative fixture.
- External action request negative fixture.
- Low-confidence or unsupported inference negative fixture.
- Forbidden destination or data-boundary violation negative fixture.
- Source mutation requested without approval negative fixture.
- Source inventory stored outside approved storage negative fixture.

## Fixture Safety Rules

- Fixtures must be synthetic only.
- Fixtures must not contain real customer data, credentials, tokens, secrets, MFA content, account/security material, production data, source-system content, or private user content.
- Fixtures must live under `_bmad/memory/knx/fixtures/synthetic`.
- Negative fixtures must clearly mark the expected failure or concern.
- Fixtures must not trigger external sends, installs, account changes, source mutation, or live runtime state creation.
- Fixtures that mention source inventory must use synthetic paths or clearly synthetic examples unless they are metadata-only references to approved local commands.
- Referenced negative validation evidence IDs should be materialized as standalone synthetic validation evidence examples before a validator result is treated as clean `PASS`.

## Data-Boundary Dependencies

- Approved source root: `C:/Users/slaw_dawg/Kendall_Nxt`.
- Approved source operation: read/planning only.
- Approved storage root: `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`.
- Source packets may describe approved local source material for planning, but must not copy customer, production, credential, token, MFA, or account/security content into KNX memory.
- Source inventory evidence may be materialized only under the approved storage root.
- Git/GitHub is not approved as live deployment/runtime state.
- GitHub/remotes remain disabled for now.
- Credentials, tokens, MFA, account/security material, customer systems, and production systems remain forbidden.
- External provider processing requires explicit per-use approval and safety review for the specific send.

Source: data-boundary-derived from `data-boundaries.md`.

## Execution-Policy Dependencies

- Prefer mature local workflows and deterministic local processing.
- Accepted mature source-inventory tools: `git ls-files`, `rg --files`, and PowerShell grouping.
- Local model runtime and GPU-backed processing are unresolved.
- Custom glue code remains deferred until mature-tool and deterministic-local options are considered and a specific gap is recorded.
- External providers remain layer 5, last-resort, and per-use approval-gated.

Source: execution-policy-derived from `execution-policy.md`.

## Open Questions

1. What identifier convention should downstream operational workflows use for artifact IDs?
2. Should generated reports be grouped separately from source records?
3. Should future inventories include checksums, or would that add unnecessary detail for planning?
4. Which source classes should the first real source packets cover?
5. Should any workflow expand beyond read/planning into source mutation?
6. Who can approve risk score `9` waivers?

## Decision Sources

- Contract status: profile-derived, execution-policy-derived, data-boundary-derived, and mature-tool-review-derived.
- Artifact list: defaulted from KNX source-evidence workflow.
- Required fields: defaulted from KNX minimum field guidance and adapted for current boundaries.
- Status vocabulary: defaulted.
- Validation result vocabulary: defaulted.
- Risk scoring rule: defaulted.
- Negative fixture categories: defaulted.
- Fixture safety rules: data-boundary-derived and defaulted.
- Data-boundary dependencies: data-boundary-derived.
- Execution-policy dependencies: execution-policy-derived.
- Source inventory evidence fields: mature-tool-review-derived from `decisions/mature-tool-source-inventory-2026-06-01.md`.
- First source inventory materialization plan: `decisions/source-inventory-planning-2026-06-01.md`.
- First materialized source inventory evidence: `_bmad/memory/knx/runtime/source-inventory/source-inventory-2026-06-01.json`.
- First materialized source inventory validation evidence: `_bmad/memory/knx/runtime/source-inventory/validation-source-inventory-2026-06-01.json`.
