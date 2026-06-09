# Kendall_vNxt Provider Disabled Fixtures

Date: 2026-06-08
Status: accepted fixture baseline
Scope: Disabled local provider fixture evidence for future provider PRDs

## Purpose

Disabled provider fixtures make provider differences visible before any HTTP adapter exists.

The fixtures prove that Ollama, LM Studio, vLLM, and llama.cpp remain no-call providers while still carrying provider-specific endpoint family, redaction, timeout, cancellation, and retention policy evidence.

## Fixture Fields

Each disabled provider proof includes:

- worker id,
- provider label,
- disabled reason,
- endpoint family,
- deny-all endpoint policy,
- HTTP calls attempted flag,
- model calls attempted flag,
- network access attempted flag,
- credential access attempted flag,
- redaction checks,
- timeout policy,
- cancellation policy,
- retention policy.

All call/access booleans must remain false while the provider is disabled.

## Provider Fixture Baselines

### Ollama

- Endpoint family: `ollama_openai_compatible_localhost`
- Timeout policy: connect timeout and total timeout required before enablement.
- Cancellation policy: request abort must map to attempt cancellation.
- Retention policy: raw prompts and completions are forbidden in retained evidence.

### LM Studio

- Endpoint family: `lm_studio_openai_compatible_localhost`
- Timeout policy: connect timeout and total timeout required before enablement.
- Cancellation policy: request abort must map to attempt cancellation.
- Retention policy: raw prompts and completions are forbidden in retained evidence.

### vLLM

- Endpoint family: `vllm_openai_compatible_localhost`
- Timeout policy: queue timeout and total timeout required before enablement.
- Cancellation policy: request abort and batch job cancellation must map to attempt cancellation.
- Retention policy: raw prompts, completions, and batch payloads are forbidden in retained evidence.

### llama.cpp

- Endpoint family: `llamacpp_openai_compatible_localhost`
- Timeout policy: short context timeout and total timeout required before enablement.
- Cancellation policy: request abort must map to attempt cancellation.
- Retention policy: raw prompts and completions are forbidden in retained evidence.

## Stop Line

These fixtures do not enable provider calls. A provider-specific PRD must still approve exact endpoint policy, prompt construction, cancellation, timeout, retention, dashboard copy, tests, and rollback before any adapter calls a provider.
