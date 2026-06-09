# Story 5.2: Subscription Launch Approval Binding And Stale Rejection

## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want launch approval bound to exact route, attempt, workspace, policy, target, and command-template evidence,
so that stale or mismatched approvals cannot start a subscription-agent process.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves subscription-agent launch work.

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
