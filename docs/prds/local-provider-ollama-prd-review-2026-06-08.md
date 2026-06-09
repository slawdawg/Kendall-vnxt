# Ollama Local Provider PRD Review

Date: 2026-06-08
Status: review complete, implementation not approved
Scope: Review of `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`

## Decision Summary

The Ollama PRD is suitable as the first local-provider candidate, but it is not approved for implementation.

The next safe work is approval-gated story preparation, not provider execution. Ollama must remain disabled until an operator explicitly approves crossing from no-call fixtures into executable provider behavior.

## Open Questions Resolved For Planning

### Provider-Specific Setting

Decision: Ollama needs a provider-specific setting in addition to any broad local-provider gate.

Required shape for future implementation:

- broad gate remains false by default,
- Ollama-specific gate remains false by default,
- both gates must be true before any Ollama call is possible,
- LM Studio, vLLM, and llama.cpp remain disabled even if Ollama is enabled later.

Rationale: a broad `SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS` flag is too coarse for provider-by-provider rollout.

### Default Model

Decision: no hardcoded default model is approved.

Required shape for future implementation:

- model id must be explicitly configured,
- missing model id must reject provider execution,
- model id must be shown in dashboard and runtime evidence,
- tests must use a non-calling fixture model id.

Rationale: local model availability differs by machine, and hidden defaults would make evidence difficult to interpret.

### Response Summaries

Decision: retained response evidence should use deterministic truncation and metadata summaries only.

Required shape for future implementation:

- no second model pass for summarization in the first provider slice,
- no raw prompt retention,
- no raw completion retention,
- record bounded response metadata, truncation state, redaction state, and artifact references.

Rationale: a second summarization pass would introduce extra provider calls and complicate retention policy.

### Maximum Retained Response Size

Decision: retain no raw provider response text in workflow events.

Required shape for future implementation:

- workflow events may store response length, truncation flag, redaction flag, exit/timeout/cancel status, and artifact references,
- artifacts may store a redacted summary only,
- any future raw-retention exception requires a separate security decision.

Rationale: event payloads should remain safe, compact, and reviewable.

## Approval Gate

Before implementation stories can move from blocked to ready, an operator must explicitly approve:

- provider-specific settings and environment variable names,
- endpoint allowlist and port policy,
- model id configuration behavior,
- timeout and cancellation values,
- artifact retention limits,
- dashboard copy for enabled Ollama,
- rollback procedure.

## Non-Execution Confirmation

This review does not add:

- Ollama HTTP calls,
- provider/model calls,
- endpoint discovery,
- model discovery,
- process launch,
- command execution,
- source mutation,
- network access beyond existing normal dashboard/supervisor APIs,
- credential access.
