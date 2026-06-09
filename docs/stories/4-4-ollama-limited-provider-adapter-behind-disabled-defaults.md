# Story 4.4: Ollama Limited Provider Adapter Behind Disabled Defaults

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want an Ollama provider adapter implemented only after settings, redaction, retention, timeout, cancellation, dashboard, and rollback gates exist,
so that the first provider call is narrow, local, auditable, and reversible.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves crossing into Ollama provider execution.

## Acceptance Criteria

1. Adapter calls only the approved local Ollama endpoint.
2. Adapter requires explicit provider-specific settings and configured model id.
3. Adapter uses the approved prompt construction contract.
4. Adapter applies timeout and cancellation policies.
5. Adapter stores only approved evidence and artifact references.
6. Dashboard clearly distinguishes enabled Ollama from disabled providers.
7. Rollback disables Ollama and returns registry/check evidence to disabled state.
8. Tests prove default disabled, enabled bounded behavior, timeout, cancellation, redaction, retention, and rollback.

## Safety Gates

- Implementation requires explicit approval before any provider call.
- No LM Studio, vLLM, llama.cpp, remote provider, premium, command, source mutation, credential, or subscription-agent authority.
