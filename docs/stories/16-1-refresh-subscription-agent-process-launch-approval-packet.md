---
baseline_commit: 15bdb0d540a91deeb1eabb1e28fd5e4c341d9b05
---

# Story 16.1: Refresh Subscription-Agent Process Launch Approval Packet

Status: done

## Story

As Bob,
I want the subscription-agent process-launch approval packet refreshed from current Epic 8 evidence,
so that any future real launch requires exact workspace, command, environment, lifecycle, retention, rollback, and stop-line approval.

## Acceptance Criteria

1. Given subscription-agent process launch is selected as the next gated lane, when the packet is refreshed, then it binds any future candidate launch to work item id, execution attempt id, route decision id, worker id, lane, authority mode, workspace plan id, launch policy id, target id, command template id, command argv, cwd, environment allowlist, blocked credential/session paths, artifact limits, redaction/truncation, timeouts, lifecycle policies, verification command, retained evidence, operator, rollback path, stop lines, and expiry or review point.
2. Given Epic 8 only approved an artifact-only fixture path, when this story completes, then it explicitly keeps production/direct process launch blocked until Bob accepts the exact future launch approval.
3. Given process launch is high risk, when the packet is written, then it blocks shell expansion, arbitrary environment inheritance, credential/session access, provider calls, source mutation, generated patch application, issue sync, PR delivery, cleanup, and failed-check bypass.
4. Given the story is documentation/packet-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the subscription-agent process-launch approval packet. (AC: 1, 2, 3)
  - [x] Bind required launch identity, workspace, command, environment, lifecycle, output, retention, verification, rollback, and stop-line fields.
  - [x] Preserve Story 8.5 as artifact-only fixture evidence, not production process-launch approval.
  - [x] Prohibit shell expansion, credential/session inheritance, provider calls, source mutation, PR delivery, and cleanup.
- [x] Update story navigation for Epic 16. (AC: 1)
  - [x] Add Epic 16 and Story 16.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before real subscription-agent process launch. It refreshes the exact future approval packet for deferred Story 5.5 after Epic 8 completed the artifact-only fixture path.

Relevant existing context:

- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/stories/8-5-execute-one-explicitly-approved-artifact-only-subscription-agent-launch.md`
- `docs/stories/8-6-record-verification-recovery-and-rollback-evidence.md`
- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`

### Guardrails

- Do not launch a process.
- Do not use shell expansion.
- Do not inherit arbitrary environment variables.
- Do not access credentials or sessions.
- Do not call providers.
- Do not mutate source outside this documentation/story slice.
- Do not perform PR delivery or cleanup from launch authority.

### References

- [Source: `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`]
- [Source: `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`]
- [Source: `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md#candidate-lane-comparison`]
- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#1-subscription-agent-supervised-process-launch`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
- `Get-Content -Raw docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`.
- Preserved Epic 8 Story 8.5 as artifact-only fixture evidence, not direct production launch approval.
- Defined exact future process-launch approval binding, environment/workspace constraints, output retention, lifecycle evidence, rollback, and stop lines.

### File List

- `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`
- `docs/stories/16-1-refresh-subscription-agent-process-launch-approval-packet.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-13: Refreshed subscription-agent process-launch approval packet without launching a process.
