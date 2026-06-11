# Story 6.8: ExecutionAttempt Integration

Date: 2026-06-10
Status: done

## Story

As Bob,
I want Task Packet preview decisions to attach to existing execution attempt evidence,
so that Active work can show a fake or blocked attempt without granting worker launch authority.

## Context

Story 6.7 adds Task Packet v0 and preview-only lane decisions. This story connects that packet evidence to the existing `ExecutionAttempt` model while preserving the MVP rule that attempts are evidence records, not permission to execute.

## Acceptance Criteria

1. Existing execution attempt creation records the Task Packet v0 snapshot that caused the attempt.
2. Attempts created from Task Packet preview remain planned or rejected evidence only.
3. Local read-only, subscription handoff, premium, and future execution lanes remain blocked from launch.
4. Attempt evidence exposes packet id/source artifact/task kind/priority metadata.
5. Creating packet-linked attempts does not launch workers, call providers, run commands, mutate source, perform Git operations, or call GitHub.
6. Duplicate active attempts remain blocked.
7. Tests cover packet-linked attempts, rejected/blocked lane behavior, metadata evidence, and no-execution behavior.

## Authority

Allowed:

- execution attempt metadata/evidence wiring,
- fake or blocked attempts only,
- supervisor API/service/test updates,
- dashboard contract/type updates if evidence shape changes.

Blocked:

- worker launch,
- Codex/Claude/Ollama calls,
- command execution beyond tests,
- source mutation,
- Git/GitHub operations,
- merge,
- cleanup automation.

## Implementation Notes

- Reuse the existing `ExecutionAttempt` model and route-bound attempt creation.
- Treat Task Packet v0 as immutable evidence for the attempt.
- Do not introduce a second attempt model.

## Verification

Required focused checks:

- supervisor integration tests for packet-linked attempt evidence and blocked execution behavior,
- shared contract/type checks if attempt view changes,
- full local check when contracts or dashboard build paths are touched.
