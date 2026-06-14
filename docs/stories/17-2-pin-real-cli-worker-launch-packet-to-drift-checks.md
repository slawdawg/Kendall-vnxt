---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 17.2: Pin Real CLI Worker Launch Packet To Drift Checks

Status: review

## Story

As Bob,
I want the real CLI worker-launch approval packet pinned to code and test drift checks,
so that future Codex or Claude launch readiness cannot quietly drift away from exact tool identity, command, file scope, retention, source-mutation, credential/session, review, rollback, and stop-line boundaries.

## Acceptance Criteria

1. Given real CLI worker launch remains approval-required, when worker-launch checks run, then they verify the approval packet still states it is non-executing and cannot launch Codex or Claude by itself.
2. Given Codex and Claude have different risks, when checks run, then they verify the packet preserves one tool identity per approval and separates Codex implementation requirements from Claude scarce-review requirements.
3. Given worker launch is high risk, when checks run, then they verify the packet still requires argument-array execution, no shell expansion, approved cwd/worktree, allowed file scope, source mutation permission, diff guard, retention policy, environment allowlist, blocked credential/session paths, timeout/cancellation, verification, review requirement, retained evidence, rollback path, stop lines, and expiry or review point.
4. Given worker authority defaults must remain disabled, when checks run, then they verify supervisor settings keep worker source mutation, network, and credential gates default disabled and service/tests preserve Codex/Claude no-launch readiness stop lines.
5. Given this story is non-executing, when verification runs, then it does not launch Codex, launch Claude, execute worker shell commands, mutate source by worker, read credentials or sessions, call providers, sync issues, deliver PRs, clean worktrees, or bypass failed checks.

## Tasks / Subtasks

- [x] Add real CLI worker-launch approval-packet drift check. (AC: 1, 2, 3, 4)
  - [x] Verify approval packet status, authority family, operation shape, one-tool identity, no-shell boundary, source mutation policy, credential/session stop lines, and delivery/cleanup stop lines.
  - [x] Verify supervisor settings keep worker source mutation, network, and credentials disabled by default.
  - [x] Verify supervisor service keeps Codex and Claude readiness reports no-launch and read-only.
  - [x] Verify tests preserve Codex/Claude no-launch stop lines and source-mutation false evidence.
- [x] Wire focused worker-launch verification into package scripts. (AC: 1, 2, 3, 4)
  - [x] Add `check:worker-launch`.
  - [x] Add `check:worker-launch` to the full `check` chain.
- [x] Verify scoped worker-launch checks. (AC: 5)
  - [x] Run `pnpm.cmd run check:worker-launch`.

## Dev Notes

This story is a readiness guardrail only. It makes the real CLI worker-launch packet/code/test relationship machine-checkable, but it does not approve or perform a Codex or Claude launch.

Relevant existing context:

- `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`
- `docs/stories/17-1-refresh-real-cli-worker-launch-approval-packet.md`
- `docs/stories/6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md`
- `docs/stories/7-2-define-bounded-codex-worker-launch-contract.md`
- `docs/stories/7-4-run-first-supervised-codex-worker-launch.md`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Guardrails

- Do not launch Codex.
- Do not launch Claude.
- Do not run shell commands as a worker.
- Do not run both Codex and Claude from one approval.
- Do not mutate source unless a future exact approval names tool, work item, and file scope.
- Do not read credentials, sessions, GitHub tokens, browser sessions, SSH keys, cloud credentials, or provider credentials.
- Do not deliver PRs, merge, delete branches, delete worktrees, clean filesystem residue, sync issues, or bypass failed checks from worker-launch authority.

### References

- [Source: `docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`]
- [Source: `docs/stories/17-1-refresh-real-cli-worker-launch-approval-packet.md`]
- [Source: `docs/stories/index.md#draft-epic-17-story-map`]
- [Source: `services/supervisor/src/supervisor/config/settings.py`]
- [Source: `services/supervisor/src/supervisor/application/service.py`]
- [Source: `services/supervisor/tests/integration/test_routing_preview.py`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md`
- `rg -n "worker-process-launch|real CLI worker|Codex CLI|Claude Code|codex-cli|claude-code-cli|worker launch|sourceMutationAllowed|worker-process|check:.*worker|Codex launch|Claude launch" package.json scripts services\supervisor docs\stories docs\goals apps\dashboard\src`
- `rg -n "allow_worker_source_mutation|allow_worker_network|allow_worker_credentials|source-mutation|worker-source|worker network|worker credentials|sourceMutationAllowed|Codex or Claude launch|does not approve Codex CLI process launch|does not approve Claude CLI process launch|worker launch" services\supervisor\src\supervisor\application\service.py services\supervisor\tests\integration\test_routing_preview.py package.json`
- `Get-Content services/supervisor/src/supervisor/application/service.py | Select-Object -Skip 3000 -First 70`
- `Get-Content services/supervisor/src/supervisor/application/service.py | Select-Object -Skip 3330 -First 90`
- `pnpm.cmd run check:worker-launch`

### Completion Notes List

- Added `scripts/check-real-cli-worker-launch-approval-packet.mjs`.
- Added `pnpm.cmd run check:worker-launch`.
- Added `check:worker-launch` to the full `pnpm.cmd run check` chain.
- Confirmed scoped worker-launch verification passes without launching Codex or Claude.

### File List

- `package.json`
- `scripts/check-real-cli-worker-launch-approval-packet.mjs`
- `docs/stories/17-2-pin-real-cli-worker-launch-packet-to-drift-checks.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Added real CLI worker-launch approval-packet drift check and scoped verification evidence.
