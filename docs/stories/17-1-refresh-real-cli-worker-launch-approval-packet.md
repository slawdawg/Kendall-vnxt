---
baseline_commit: 9f8c65121cb0d8151613abd3da8f02d10e443831
---

# Story 17.1: Refresh Real CLI Worker Launch Approval Packet

Status: done

## Story

As Bob,
I want the real CLI worker launch approval packet refreshed from fake-worker and Epic 7 evidence,
so that any future Codex or Claude process launch requires exact tool, scope, command, retention, verification, rollback, and stop-line approval.

## Acceptance Criteria

1. Given real CLI worker launch remains blocked after Story 6.1, when the packet is refreshed, then it binds any future launch to tool identity, work item id, execution attempt id, route decision id, worker id, lane, authority mode, command template, argv, cwd/worktree, allowed file scope, source mutation permission, diff guard, retention policy, environment allowlist, blocked credential/session paths, timeout/cancellation, verification, review requirement, retained evidence, operator, approval timestamp, rollback, stop lines, and expiry or review point.
2. Given Codex and Claude have different risks, when the packet is written, then it separates Codex implementation requirements from Claude scarce-review requirements.
3. Given worker launch is high risk, when this story completes, then it does not launch a worker, run shell commands, mutate source, read credentials/sessions, deliver PRs, cleanup worktrees, or bypass failed checks.
4. Given the story is documentation/packet-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the real CLI worker launch approval packet. (AC: 1, 2, 3)
  - [x] Bind required tool identity, command, file scope, mutation, retention, verification, rollback, and stop-line fields.
  - [x] Separate Codex implementation requirements from Claude review requirements.
  - [x] Preserve fake-worker fallback and no-launch default.
- [x] Update story navigation for Epic 17. (AC: 1)
  - [x] Add Epic 17 and Story 17.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before real Codex CLI or Claude Code CLI launch. It refreshes the future approval packet for the deferred real-worker launch lane.

Relevant existing context:

- `docs/stories/6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`
- `docs/goals/epic-7-useful-supervised-execution-plan-2026-06-11.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`

### Guardrails

- Do not launch Codex.
- Do not launch Claude.
- Do not run shell commands as a worker.
- Do not mutate source.
- Do not read credentials or sessions.
- Do not deliver PRs or cleanup from worker authority.

### References

- [Source: `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`]
- [Source: `docs/stories/6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`]
- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#2-real-cli-worker-launch-beyond-fake-worker-spike`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/stories/6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`.
- Preserved Story 6.1 fake-worker evidence as no-launch baseline.
- Defined future real CLI worker approval binding, Codex/Claude-specific requirements, rollback, and stop lines.

### File List

- `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`
- `docs/stories/17-1-refresh-real-cli-worker-launch-approval-packet.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Refreshed real CLI worker launch approval packet without launching a worker.
