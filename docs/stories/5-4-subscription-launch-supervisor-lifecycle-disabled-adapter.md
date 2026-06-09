# Story 5.4: Subscription Launch Supervisor Lifecycle Disabled Adapter

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want a disabled process-supervisor adapter that proves lifecycle, timeout, cancellation, cleanup, and evidence behavior before real launch,
so that future process execution can be validated without starting an agent.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves subscription-agent launch work.

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
