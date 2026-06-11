# Story 5.3: Subscription Launch Workspace Output And Session Contract

Status: done as non-executing subscription-launch preparation; supervised process launch deferred post-MVP
## Status

done

## Story

As the Kendall_vNxt operator,
I want launch workspace, output, and session boundaries defined before process execution,
so that subscription-agent launch cannot inherit credentials, write broadly, or persist unbounded output.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing subscription-agent launch preparation only. Do not add or perform process launch, shell command execution, credential access, source mutation by workers, external sends, provider/model calls, premium execution, or subscription-agent supervised process execution.

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

## Tasks/Subtasks

- [x] Define artifact-only workspace materialization metadata.
- [x] Define forbidden credential, session, shell profile, SSH, browser, and token paths.
- [x] Define deny-inheritance environment policy and explicit allowlist behavior.
- [x] Define stdout/stderr summary-only output retention with redaction and truncation metadata.
- [x] Surface workspace, output, and session boundary summaries in runtime exports and dashboard attempt evidence.

## Dev Agent Record

### Completion Notes

- Added workspace/session/output contracts to disabled subscription launch stubs and execution attempt workspace evidence.
- Runtime evidence exports exclude raw subscription-agent output and inherited environment values.
- Dashboard attempt evidence now renders materialization, environment, session, and output policies.

## File List

- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-09: Implemented under explicit non-executing subscription-agent launch preparation approval and moved to done.
