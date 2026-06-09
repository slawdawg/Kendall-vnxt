# Story 5.1: Subscription Launch Settings Policy And Target Registry

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want subscription-agent launch controlled by disabled-default settings, launch policy, and target registry entries,
so that no subscription agent can be launched without an explicit target and policy decision.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves subscription-agent launch work.

## Acceptance Criteria

1. Add disabled-default launch settings.
2. Add target-specific registry entries for approved launch targets only.
3. Keep all targets disabled unless a target-specific policy and setting are approved.
4. Execution configuration checks report launch target state separately from handoff packages.
5. Disabled launch stubs continue to work without launching processes.
6. Tests prove default disabled behavior and target-specific denial.
7. No process launch is added in this story.

## Safety Gates

- No process launch.
- No shell command execution.
- No credential or session access.
- No source mutation.
