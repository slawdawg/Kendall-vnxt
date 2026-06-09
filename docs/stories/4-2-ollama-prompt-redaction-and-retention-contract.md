# Story 4.2: Ollama Prompt Redaction And Retention Contract

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want Ollama prompt construction and retained evidence bounded before any provider call exists,
so that local provider execution cannot leak secrets or persist raw provider payloads.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves Ollama local-provider execution work.

## Acceptance Criteria

1. Define approved prompt sources for Ollama evidence explanation.
2. Reject prompt construction if secrets, environment values, credential paths, or unrelated local files are present.
3. Store no raw prompt text in workflow events.
4. Store no raw completion text in workflow events.
5. Retain only metadata, redaction state, truncation state, summaries, and artifact references.
6. Add fixture tests for redaction and retention behavior.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No raw prompt or completion retention.
- No credential access.
- No source mutation.
