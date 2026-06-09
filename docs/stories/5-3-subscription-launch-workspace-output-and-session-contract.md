# Story 5.3: Subscription Launch Workspace Output And Session Contract

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want launch workspace, output, and session boundaries defined before process execution,
so that subscription-agent launch cannot inherit credentials, write broadly, or persist unbounded output.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves subscription-agent launch work.

## Acceptance Criteria

1. Define per-attempt workspace materialization metadata.
2. Keep first implementation artifact-only or patch-only.
3. Define forbidden credential, session, shell profile, SSH, browser, and token paths.
4. Define explicit environment allowlist behavior.
5. Define stdout/stderr artifact limits, redaction, truncation markers, and retention metadata.
6. Runtime evidence exports include workspace, output, and session-boundary summaries.
7. Tests prove no arbitrary environment inheritance, no raw output in events, and no source mutation.
8. No process launch is added in this story.

## Safety Gates

- No process launch.
- No inherited credentials or sessions.
- No source mutation.
- No unbounded output retention.
