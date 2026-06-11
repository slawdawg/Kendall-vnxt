# Story 5.5: Subscription Launch Supervised Process Behind Approval

Status: deferred post-MVP; blocked pending explicit supervised process-launch approval
## Status

Blocked Pending Explicit Approval

## Story

As the Kendall_vNxt operator,
I want direct subscription-agent launch enabled only after settings, target registry, approval binding, workspace, output, session, lifecycle, cancellation, timeout, dashboard, export, and rollback gates are complete,
so that the first real launch is narrow, supervised, auditable, and reversible.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves crossing into real subscription-agent process launch.

## Acceptance Criteria

1. Launch only the approved target and command template.
2. Require exact non-stale approval binding.
3. Materialize an isolated per-attempt workspace.
4. Apply environment allowlist and credential/session denials.
5. Capture bounded redacted output as artifacts.
6. Update execution attempt lifecycle for starting, running, cancellation, timeout, failure, and completion.
7. Dashboard shows launch state and disabled authorities.
8. Runtime evidence exports include launch summaries without raw secrets or unbounded output.
9. Rollback disables launch and rejects new launch attempts.
10. Tests prove default disabled behavior, approved bounded launch, cancellation, timeout, output retention, session denial, and rollback.

## Safety Gates

- Requires explicit approval before any process launch.
- No provider/model calls unless separately approved.
- No source mutation unless separately approved.
- No credential or broad environment inheritance.
