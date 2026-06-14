---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 16.2: Pin Subscription-Agent Process Launch Packet To Drift Checks

Status: review

## Story

As Bob,
I want the subscription-agent process-launch approval packet pinned to code and test drift checks,
so that future launch readiness work cannot quietly drift away from exact approval, argument-array execution, environment allowlist, credential/session denial, metadata-only retention, and disabled production-launch boundaries.

## Acceptance Criteria

1. Given subscription-agent process launch remains approval-required, when process lifecycle checks run, then they verify the process-launch approval packet still states it is non-executing and cannot launch a process by itself.
2. Given production launch is distinct from Story 8.5 artifact-only fixture evidence, when checks run, then they verify the packet and Story 16.1 keep direct process launch blocked until Bob accepts an exact future approval.
3. Given process launch is high risk, when checks run, then they verify the packet still requires argument-array execution, no shell expansion, explicit environment allowlist, blocked credential/session paths, artifact limits, lifecycle policies, verification command, retained evidence, rollback path, stop lines, and expiry or review point.
4. Given launch gates must remain disabled by default, when checks run, then they verify supervisor settings keep broad and target-specific subscription launch gates default disabled and service evidence keeps `process_launch_allowed=False` for readiness/configuration checks.
5. Given this story is non-executing, when verification runs, then it does not launch a process, execute shell commands, inherit credentials or sessions, call providers, mutate source by worker, sync issues, deliver PRs, clean worktrees, or bypass failed checks.

## Tasks / Subtasks

- [x] Add subscription-agent process-launch approval-packet drift check. (AC: 1, 2, 3, 4)
  - [x] Verify approval packet status, authority family, operation shape, argument-array/no-shell boundary, environment policy, credential/session stop lines, output retention, and Story 8.5 non-production boundary.
  - [x] Verify supervisor settings keep broad and target-specific subscription launch gates disabled by default.
  - [x] Verify supervisor service keeps launch configuration checks non-executing.
  - [x] Verify integration tests preserve non-mutating stubs, missing-approval rejection, artifact-only fixture acceptance, and read-only evaluation behavior.
- [x] Wire the new drift check into process lifecycle verification. (AC: 1, 2, 3, 4)
  - [x] Preserve the existing process lifecycle policy check.
  - [x] Allow the process lifecycle check script to require inclusion rather than exact command equality.
- [x] Verify scoped process lifecycle checks. (AC: 5)
  - [x] Run `pnpm.cmd run check:process-lifecycle`.

## Dev Notes

This story is a readiness guardrail only. It makes the subscription-agent process-launch packet/code/test relationship machine-checkable, but it does not approve or perform a real process launch.

Relevant existing context:

- `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`
- `docs/stories/16-1-refresh-subscription-agent-process-launch-approval-packet.md`
- `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `scripts/check-process-lifecycle-policy.mjs`

### Guardrails

- Do not launch a process.
- Do not use shell string execution.
- Do not inherit arbitrary environment variables.
- Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.
- Do not call providers.
- Do not mutate source by worker.
- Do not apply generated patches automatically.
- Do not sync issues, deliver PRs, clean worktrees, or bypass failed checks.
- Do not treat Story 8.5 artifact-only fixture approval as production process-launch approval.

### References

- [Source: `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/16-1-refresh-subscription-agent-process-launch-approval-packet.md`]
- [Source: `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`]
- [Source: `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`]
- [Source: `docs/stories/index.md#draft-epic-16-story-map`]
- [Source: `services/supervisor/src/supervisor/config/settings.py`]
- [Source: `services/supervisor/src/supervisor/application/service.py`]
- [Source: `services/supervisor/tests/integration/test_routing_preview.py`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`
- `rg -n "subscription-agent-launch|subscription agent|process launch|process-launch|SUPERVISOR_ALLOW_SUBSCRIPTION|allow_subscription|command argv|artifact-only|Story 8\\.5|executionAllowed|processLaunchAllowed|check:process-lifecycle" package.json scripts services\supervisor docs\stories docs\goals apps\dashboard\src`
- `Get-Content services/supervisor/src/supervisor/application/service.py | Select-Object -Skip 5900 -First 38`
- `rg -n "def test_subscription_agent_launch|artifact-only fixture|process launch|Direct process launch|Story 8\\.5|This story intentionally" services\supervisor\tests\integration\test_routing_preview.py docs\stories\16-1-refresh-subscription-agent-process-launch-approval-packet.md`
- `pnpm.cmd run check:process-lifecycle`

### Completion Notes List

- Added `scripts/check-subscription-agent-process-launch-approval-packet.mjs`.
- Wired the new check into `pnpm.cmd run check:process-lifecycle`.
- Updated the existing process lifecycle check so it still requires the original lifecycle policy command while allowing lane-specific checks to be appended.
- Confirmed scoped process lifecycle verification passes without launching a process.

### File List

- `package.json`
- `scripts/check-process-lifecycle-policy.mjs`
- `scripts/check-subscription-agent-process-launch-approval-packet.mjs`
- `docs/stories/16-2-pin-subscription-agent-process-launch-packet-to-drift-checks.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Added subscription-agent process-launch approval-packet drift check and scoped verification evidence.
