---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.3: Implement Disabled/Dry-Run Process Supervisor Adapter

Date: 2026-06-12
Status: done

## Story

As Bob,
I want Kendall to exercise the subscription-agent process lifecycle through a disabled or dry-run adapter,
so that lifecycle, cancellation, timeout, output artifact, and rollback behavior are testable before real process launch.

## Acceptance Criteria

1. Given subscription-agent launch remains disabled, when Kendall routes a launch attempt through the adapter, then no real OS process starts, no executable command template is used, and lifecycle evidence records disabled or dry-run state.
2. Given the Story 8.2 launch policy has missing or blocked envelope fields, when the adapter evaluates readiness, then the result remains blocked and reports the exact missing or stale field using stable blocked reason ids.
3. Given dry-run lifecycle evidence is recorded, when the attempt transitions are inspected, then planned, approved, starting, running, cancel requested, cancelled, timed out, failed, completed, and rejected states are represented as metadata-only evidence without process execution.
4. Given output or generated files are simulated, when Kendall records evidence, then output is bounded, redacted, artifact-referenced, and excluded from raw workflow event payloads.
5. Given timeout, cancellation, orphan detection, terminal-state reconciliation, child-process tracking, heartbeat, cleanup, or rollback is simulated, when evidence is exported, then the export records the policy result without launching a process or deleting local/remote resources.
6. This story remains non-executing for subscription-agent launch authority: it must not start a real subscription-agent process, run worker shell commands, use executable command templates, call providers, inherit credentials or sessions, mutate source, mutate issues, perform PR/merge/cleanup actions, or grant broad autonomy.

## Tasks / Subtasks

- [x] Reconcile existing disabled adapter evidence with the Epic 8 policy. (AC: 1, 2, 6)
  - [x] Inspect existing Story 5.4 surfaces before adding anything new: `DisabledSubscriptionLaunchAdapter`, launch stub evidence, runtime export evidence, dashboard/report views, and integration tests.
  - [x] Prefer extending existing disabled/dry-run metadata over creating a parallel process-supervisor model.
  - [x] Bind disabled/dry-run readiness to the Story 8.2 policy id `epic-8-first-subscription-launch-policy-v1`.
- [x] Add or refresh disabled/dry-run lifecycle evidence. (AC: 1, 3, 5, 6)
  - [x] Represent metadata-only lifecycle states without spawning a process.
  - [x] Include heartbeat policy, child-process tree tracking policy, orphan detection policy, terminal-state reconciliation policy, and idempotent cleanup policy as disabled/dry-run evidence.
  - [x] Ensure blocked readiness is explicit when any required launch envelope field remains missing, stale, or rejected.
- [x] Add or refresh output artifact evidence. (AC: 4, 6)
  - [x] Preserve raw stdout/stderr exclusion from workflow events.
  - [x] Record bounded byte counts, redaction status, truncation status, and artifact references only.
  - [x] Keep generated patches as artifacts for operator review; do not apply them.
- [x] Preserve safety boundaries and fail closed. (AC: 1, 2, 5, 6)
  - [x] Prove no OS process launch, shell command execution, provider/model call, credential/session access, source mutation, issue sync, PR/merge/cleanup execution, or broad autonomy is attempted.
  - [x] Preserve dashboard launch controls as disabled/readiness-only.
  - [x] Preserve rollback/global-disable evidence as metadata-only; do not delete branches, worktrees, artifacts, or remote resources.
- [x] Add focused tests and update story evidence. (AC: 1-6)
  - [x] Add or update integration tests proving no process launch is attempted.
  - [x] Add or update tests for missing envelope fields, stale policy evidence, lifecycle simulation, bounded output evidence, timeout/cancellation/orphan/cleanup evidence, and runtime export summaries.
  - [x] Record verification commands and results in this story file.

### Review Findings

- [x] [Review][Patch] Exact launch envelope values are incomplete for stale approval tracking [services/supervisor/src/supervisor/domain/subscription_launch.py]
- [x] [Review][Patch] Readiness evidence omits exact rejected/missing fields for permission envelope and command template executability [services/supervisor/src/supervisor/domain/subscription_launch.py]
- [x] [Review][Patch] Workflow event export can emit null readiness and omits metadata-only lifecycle policy result summaries [services/supervisor/src/supervisor/application/service.py]
- [x] [Review][Patch] Output artifact evidence has no inspectable simulated artifact references [services/supervisor/src/supervisor/domain/subscription_launch.py]
- [x] [Review][Patch] TypeScript contract makes new readiness evidence mandatory while API schema defaults it [packages/contracts/src/api.ts]

## Dev Notes

### Product Intent

Story 8.3 is the first Epic 8 story that may touch implementation surfaces after the policy artifacts. It still must not cross the real-process launch line. The goal is to make the disabled/dry-run path concrete and testable so later stories can show readiness and, eventually, request a tightly bounded launch approval.

This story is not the real launch. It is a disabled/dry-run adapter and evidence story.

### Prior Story Intelligence

- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
  - Real subscription-agent process launch remains blocked.
  - Story 8.3 owns disabled/dry-run lifecycle evidence and several policy blockers.
- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
  - Target status is `not-approved`.
  - Launch readiness is `blocked_pending_exact_launch_approval`.
  - Story 8.3 may consume the policy for disabled/dry-run evidence only.
  - Required dry-run behavior: no OS process launch, no command template executable by Kendall, no inherited environment beyond explicit allowlist evidence, no credentials/sessions, no provider/model/network calls, bounded artifact references only, disabled/dry-run lifecycle evidence, and blocked readiness for missing envelope fields.
- `docs/stories/8-2-define-first-launch-target-policy-and-execution-envelope.md`
  - Current status: done.
  - Review fixes added permission envelope, output policy, approval timestamp semantics, inert command template status, stale consequences, heartbeat policy, and child process tree tracking.

### Existing Implementation To Reuse

- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
  - Existing Story 5.4 implemented `DisabledSubscriptionLaunchAdapter` lifecycle evidence.
  - Existing completion notes say launch stub events record process/shell/credential/external-send attempted flags as false.
  - Existing file list points to likely implementation surfaces:
    - `services/supervisor/src/supervisor/domain/subscription_launch.py`
    - `services/supervisor/src/supervisor/application/service.py`
    - `services/supervisor/src/supervisor/api/schemas.py`
    - `packages/contracts/src/api.ts`
    - `services/supervisor/tests/integration/test_routing_preview.py`
- Reuse the existing disabled adapter shape and tests. Do not invent a second adapter unless the existing one cannot express Epic 8 evidence.

### Architecture Guardrails

- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Launch requires explicit setting, launch policy, and approval binding.
  - Queue leases must not gain process launch fields or authority.
  - Runtime evidence exports include launch summaries without raw secrets or unbounded output.
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Future process execution attaches to `ExecutionAttempt`, not `QueueLease`.
  - Required process-supervisor evidence includes child process tree tracking, startup timeout, run timeout, cancellation timeout, heartbeat, terminal-state reconciliation, orphan detection, and idempotent cleanup.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Real worker/provider execution remains blocked by default.
  - Arbitrary worker commands, provider/model calls, source mutation, network access, credential access, broad snapshot export, and background assistant behavior remain denied.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - Dashboard launch remains execution-prohibited display until backend authority exists.

### Implementation Guidance

- Start with failing tests in `services/supervisor/tests/integration/test_routing_preview.py` or the existing subscription launch test area if one exists.
- Search before editing for existing names:
  - `DisabledSubscriptionLaunchAdapter`
  - `subscription_agent_process_launch_not_enabled`
  - `subscription_launch`
  - `processLaunchAttempted`
  - `shellCommandAttempted`
  - `credentialAccessAttempted`
- Keep all new fields metadata-only. Do not add `subprocess`, `Start-Process`, shell runner, provider client, network call, Git/GitHub mutation, or cleanup deletion logic.
- If TypeScript/Pydantic contracts need fields for dry-run evidence, keep them explicit and narrow. Avoid generic free-form process output payloads.
- Any dry-run artifact reference must be a reference/summary, not raw stdout/stderr in workflow events.
- Missing policy fields should be reported as blocked using stable snake_case reasons, not silently defaulted.

### Testing

- Focused supervisor tests:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_launch or dry_run or disabled_adapter"`
- Documentation/story artifact checks:
  - `pnpm.cmd run check:docs`
- Broader verification:
  - `pnpm.cmd run check`
- No live subscription-agent process, provider, network, credential, GitHub mutation, PR/merge/cleanup, branch/worktree deletion, or source-mutation verification is allowed for this story.

### References

- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/goals/epic-8-first-subscription-launch-policy-2026-06-12.md`
- `docs/stories/8-2-define-first-launch-target-policy-and-execution-envelope.md`
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-06-12: Red phase confirmed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub"` failing on the old disabled launch policy id and missing readiness event summary.
- 2026-06-12: Green phase passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub"`: 3 passed, 95 deselected, 1 warning.
- 2026-06-12: Story-focused supervisor selection passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_launch or dry_run or disabled_adapter"`: 4 passed, 94 deselected, 1 warning.
- 2026-06-12: `pnpm.cmd run check:docs` passed.
- 2026-06-12: Initial sandboxed `pnpm.cmd run check` failed only because restricted network access blocked dashboard Google Fonts fetches.
- 2026-06-12: Escalated read-only `pnpm.cmd run check` passed: dashboard build succeeded and supervisor tests reported 153 passed, 1 warning.
- 2026-06-12: Code review patches passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub"`: 3 passed, 95 deselected, 1 warning.
- 2026-06-12: Code review patches passed with `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "subscription_launch or dry_run or disabled_adapter"`: 4 passed, 94 deselected, 1 warning.

### Completion Notes List

- Extended the existing `DisabledSubscriptionLaunchAdapter` instead of creating a parallel process-supervisor model.
- Bound disabled/dry-run subscription launch metadata to `epic-8-first-subscription-launch-policy-v1` and added explicit blocked readiness evidence with stable reason ids.
- Added metadata-only lifecycle evidence for completed/rejected states plus heartbeat, child-process tree tracking, orphan detection, terminal reconciliation, idempotent cleanup, and rollback/global-disable policies.
- Added artifact-only output evidence with zero raw byte capture, redaction/truncation metadata, simulated artifact references, and generated patch handling as operator-reviewed artifacts only.
- Preserved workflow event raw output exclusion while adding a compact readiness summary to the event payload.
- Resolved code-review findings by adding exact missing/rejected readiness fields, complete approval-envelope tracked values, metadata-only lifecycle/output event summaries, simulated artifact references, and backward-compatible optional TypeScript readiness evidence.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `docs/stories/8-3-implement-disabled-dry-run-process-supervisor-adapter.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/subscription_launch.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-12: Implemented Epic 8 disabled/dry-run subscription launch adapter evidence and focused tests; story moved to review.
