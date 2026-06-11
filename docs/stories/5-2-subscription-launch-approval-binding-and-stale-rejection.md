# Story 5.2: Subscription Launch Approval Binding And Stale Rejection

Status: done as non-executing subscription-launch preparation; supervised process launch deferred post-MVP
## Status

done

## Story

As the Kendall_vNxt operator,
I want launch approval bound to exact route, attempt, workspace, policy, target, and command-template evidence,
so that stale or mismatched approvals cannot start a subscription-agent process.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing subscription-agent launch preparation only. Do not add or perform process launch, shell command execution, credential access, source mutation by workers, external sends, provider/model calls, premium execution, or subscription-agent supervised process execution.

## Acceptance Criteria

1. Define launch approval payload fields.
2. Require work item id, attempt id, route decision id, worker id, lane, authority mode, workspace plan id, launch policy id, target id, command template id, actor, timestamp, and expiry.
3. Reject launch approval if any binding field is missing or mismatched.
4. Expire approval when route, worker, lane, authority, workspace, launch policy, or command template evidence changes.
5. Record stale or mismatched approval rejection as a non-executing event.
6. Tests prove missing, mismatched, expired, and evidence-changed approvals reject.
7. No process launch is added in this story.

## Safety Gates

- No process launch.
- No command runner.
- No source mutation.
- No credential access.

## Tasks/Subtasks

- [x] Define route, attempt, workspace, policy, target, command-template, actor, timestamp, and expiry binding fields.
- [x] Reject missing, mismatched, expired, or stale launch approval binding fields.
- [x] Record launch approval rejection as a non-executing workflow event.
- [x] Prove launch-style approval rejection does not launch a process.

## Dev Agent Record

### Completion Notes

- Added launch-specific approval binding metadata to the disabled subscription launch stub.
- Added launch-style approval rejection evidence for missing/stale binding fields.
- Ordinary attempt approval behavior remains route-bound and non-executing.

## File List

- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-09: Implemented under explicit non-executing subscription-agent launch preparation approval and moved to done.
