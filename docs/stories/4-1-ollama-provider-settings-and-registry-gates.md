# Story 4.1: Ollama Provider Settings And Registry Gates

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want Ollama provider enablement controlled by provider-specific settings and registry state,
so that enabling Ollama later cannot accidentally enable other local providers or broad provider authority.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves Ollama local-provider execution work.

## Acceptance Criteria

1. Add an Ollama-specific setting that defaults to disabled.
2. Require both the broad local-provider gate and the Ollama-specific gate before Ollama can be executable.
3. Keep LM Studio, vLLM, and llama.cpp disabled.
4. Registry evidence distinguishes disabled Ollama, configured-but-disabled Ollama, and enabled Ollama.
5. Execution configuration checks report the Ollama-specific gate separately.
6. Tests prove default disabled behavior and no-call behavior.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No endpoint discovery.
- No command execution.
- No source mutation.
- No network or credential access.
