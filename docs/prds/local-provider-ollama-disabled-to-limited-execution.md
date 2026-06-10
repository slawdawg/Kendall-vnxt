# PRD: Ollama Disabled To Limited Local Provider Execution

Date: 2026-06-08
Status: draft, reviewed, not approved for implementation
Scope: Future Ollama local provider enablement path

## Summary

This PRD drafts the requirements for moving the disabled Ollama provider from metadata-only/no-call proof to a limited local provider execution lane.

Stories 4.1-4.3 are complete as non-executing no-call preparation only. They add disabled-default settings, registry evidence, prompt redaction and retention contracts, timeout and cancellation evidence, dashboard/report/export updates, and no-call fixture tests. Story 4.4 remains blocked pending explicit provider-execution approval.

This PRD does not approve provider execution. Ollama provider calls remain disabled until Story 4.4 or a successor decision record is explicitly approved with the required endpoint, model, timeout, review, and rollback scope.

Review record:

- `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`

Approval-gated story breakdown:

- `docs/stories/4-1-ollama-provider-settings-and-registry-gates.md`
- `docs/stories/4-2-ollama-prompt-redaction-and-retention-contract.md`
- `docs/stories/4-3-ollama-timeout-cancellation-and-attempt-evidence.md`
- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`

## Problem

Kendall_vNxt has local provider registry entries and no-call proof fixtures. The next design step is to define exactly what would be required to safely enable one provider, starting with Ollama.

## Goals

- Define the minimum safe Ollama execution lane.
- Preserve local-first behavior without unrestricted local access.
- Keep prompts, outputs, credentials, and filesystem access bounded.
- Make operator-visible evidence available before, during, and after attempts.
- Provide rollback and global disable controls.

## Non-Goals

- Do not implement provider HTTP calls in this PRD.
- Do not enable LM Studio, vLLM, llama.cpp, remote providers, premium execution, or subscription-agent launch.
- Do not allow source mutation.
- Do not grant credential access.
- Do not add adaptive scoring.

## Proposed Capability

Future implementation may allow a single local Ollama OpenAI-compatible endpoint for bounded evidence explanation tasks.

Initial authority mode:

- read-only evidence explanation,
- no source mutation,
- no shell commands,
- no credential access,
- no worker network access beyond the approved local Ollama endpoint,
- no retained raw prompt or completion payloads.

## Required Gates Before Implementation

1. Approve this PRD or a successor decision record.
2. Update threat-boundary policy for Ollama prompt construction and response retention.
3. Update provider disabled fixture into an executable adapter test plan.
4. Define endpoint allowlist, default model, connect timeout, total timeout, and cancellation behavior.
5. Add settings gate scoped only to Ollama.
6. Update worker registry health and disabled reason semantics.
7. Add dashboard copy that distinguishes enabled Ollama from still-disabled providers.
8. Add runtime evidence export coverage for provider attempts.
9. Add rollback/global-disable procedure.

## Endpoint Policy

Allowed endpoint family, after approval only:

- localhost Ollama OpenAI-compatible endpoint.

Required controls:

- explicit host and port allowlist,
- no remote hostnames,
- connect timeout,
- total timeout,
- cancellation maps to execution attempt cancellation,
- bounded response size,
- redaction before event/artifact retention.

## Prompt And Retention Policy

Prompt construction may use only approved evidence summaries:

- work item title,
- requested outcome,
- routing decision summary,
- workflow event summaries,
- approved local evidence packet summaries,
- attempt metadata,
- workspace isolation summary.

Forbidden:

- secrets,
- environment variables,
- credential files,
- raw provider payload retention,
- full filesystem snapshots,
- unrelated local files.

Retained evidence should include:

- prompt summary,
- response summary,
- model id,
- endpoint family,
- timeout/cancellation outcome,
- redaction result,
- artifact references.

## Acceptance Criteria For Future Implementation

1. Ollama remains disabled unless an explicit setting enables only Ollama.
2. LM Studio, vLLM, llama.cpp, premium, command, source mutation, network, credential, and subscription-agent launch authorities remain disabled.
3. Provider calls are made only to the approved local Ollama endpoint.
4. Timeout and cancellation update the execution attempt lifecycle.
5. Raw prompts and completions are not stored in workflow events.
6. Runtime evidence export includes provider attempt summaries and safety flags.
7. Dashboard copy clearly shows enabled Ollama scope and still-disabled authorities.
8. Tests prove default disabled behavior, enabled bounded behavior, timeout, cancellation, redaction, and rollback.

## Rollback

Rollback must include:

- setting `SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS=false` or a future Ollama-specific gate to false,
- registry health returning to disabled,
- dashboard showing the disabled reason,
- attempts rejecting new Ollama execution,
- runtime evidence exports retaining prior attempt summaries without raw provider payloads.

## Open Questions

Resolved for planning in `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`:

- Ollama needs a provider-specific setting in addition to any broad local-provider gate.
- No hardcoded default model is approved; model id must be explicitly configured.
- Retained response evidence should use deterministic truncation and metadata summaries only.
- Workflow events should retain no raw provider response text.
