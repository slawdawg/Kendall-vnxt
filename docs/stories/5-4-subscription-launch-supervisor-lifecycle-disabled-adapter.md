# Story 5.4: Subscription Launch Supervisor Lifecycle Disabled Adapter

## Status

done

## Story

As the Kendall_vNxt operator,
I want a disabled process-supervisor adapter that proves lifecycle, timeout, cancellation, cleanup, and evidence behavior before real launch,
so that future process execution can be validated without starting an agent.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing subscription-agent launch preparation only. Do not add or perform process launch, shell command execution, credential access, source mutation by workers, external sends, provider/model calls, premium execution, or subscription-agent supervised process execution.

## Acceptance Criteria

1. Add a disabled adapter that simulates process lifecycle without launching a process.
2. Map lifecycle evidence to execution attempt states.
3. Record timeout, cancellation, cleanup, and terminal result evidence.
4. Runtime exports include disabled adapter lifecycle evidence.
5. Dashboard shows simulated lifecycle state as disabled/non-executing.
6. Tests prove no OS process is launched.
7. Tests prove cancellation, timeout, cleanup, and terminal-state evidence.

## Safety Gates

- No real process launch.
- No command execution.
- No source mutation.
- No credential access.

## Tasks/Subtasks

- [x] Add disabled adapter evidence that simulates lifecycle without launching a process.
- [x] Map lifecycle evidence to execution attempt states.
- [x] Record timeout, cancellation, cleanup, and terminal result policies as metadata-only evidence.
- [x] Surface disabled lifecycle evidence in runtime exports, launch stubs, and dashboard/report views.
- [x] Prove no process launch, shell execution, credential access, or external send is attempted.

## Dev Agent Record

### Completion Notes

- Added `DisabledSubscriptionLaunchAdapter` lifecycle evidence for simulated start, running, cancellation, timeout, cleanup, and terminal state metadata.
- Launch stub events record process/shell/credential/external-send attempted flags as false.
- Story 5.5 remains required before any real supervised process launch.

## File List

- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-09: Implemented under explicit non-executing subscription-agent launch preparation approval and moved to done.
