# Story 4.3: Ollama Timeout Cancellation And Attempt Evidence

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want Ollama timeout and cancellation behavior mapped to execution attempts before provider calls are enabled,
so that local provider work remains reviewable and recoverable.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves Ollama local-provider execution work.

## Acceptance Criteria

1. Define connect timeout and total timeout values.
2. Define cancellation behavior that maps to execution attempt lifecycle states.
3. Record timeout and cancellation evidence without raw provider payloads.
4. Runtime evidence exports include timeout/cancellation summaries.
5. Dashboard copy shows timeout/cancellation state.
6. Tests prove timeout, cancellation, terminal-state, and retry behavior using no-call fixtures.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No process launch.
- No command execution.
- No source mutation.
