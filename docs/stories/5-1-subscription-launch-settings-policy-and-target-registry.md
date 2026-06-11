# Story 5.1: Subscription Launch Settings Policy And Target Registry

Status: done as non-executing subscription-launch preparation; supervised process launch deferred post-MVP
## Status

done

## Story

As the Kendall_vNxt operator,
I want subscription-agent launch controlled by disabled-default settings, launch policy, and target registry entries,
so that no subscription agent can be launched without an explicit target and policy decision.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing subscription-agent launch preparation only. Do not add or perform process launch, shell command execution, credential access, source mutation by workers, external sends, provider/model calls, premium execution, or subscription-agent supervised process execution.

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

## Tasks/Subtasks

- [x] Add disabled-default launch settings and target-specific gates.
- [x] Add disabled target registry evidence for Codex, Claude, and Gemini subscription targets.
- [x] Keep target registry evidence separate from subscription handoff packages.
- [x] Prove default disabled behavior and target-specific denial with supervisor tests.

## Dev Agent Record

### Completion Notes

- Added target-specific disabled-default settings and disabled target registry evidence.
- Execution configuration checks now report broad subscription launch state and target registry state separately.
- No process launch, command execution, credential/session access, worker source mutation, or external send behavior was added.

## File List

- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `apps/dashboard/src/components/execution-readiness-report-panel.tsx`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-09: Implemented under explicit non-executing subscription-agent launch preparation approval and moved to done.
