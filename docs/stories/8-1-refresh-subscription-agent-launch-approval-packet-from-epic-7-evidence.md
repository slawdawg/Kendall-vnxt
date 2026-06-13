---
baseline_commit: 84465778a690822cbefc63dd4c5d6a81bfab9fb8
---

# Story 8.1: Refresh Subscription-Agent Launch Approval Packet From Epic 7 Evidence

Date: 2026-06-12
Status: done

## Story

As Bob,
I want the deferred subscription-agent launch packet refreshed against Epic 7 green-gate evidence,
so that the next launch plan uses current readiness controls instead of the older pre-Epic-7 assumptions.

## Acceptance Criteria

1. Given Epic 7 has completed supervised Codex execution gates, when Kendall prepares the subscription-agent launch approval packet refresh, then the packet references the current green-gate, launch-contract, diff-guard, verification, Dev Console readiness, and eligibility evidence, and identifies which controls can be reused for subscription-agent launch.
2. Given the subscription-agent PRD and architecture still keep real launch behind a stop line, when the packet is generated, then it does not approve real process launch and lists the exact approvals still required before launch.
3. Given the older Story 5.5 deferred scope, when Kendall compares it to the Epic 8 plan, then the packet maps each Story 5.5 gate to an Epic 8 story, required evidence source, and unresolved approval.
4. Given any required launch input is missing, such as target, command template, environment allowlist, artifact limits, timeout/cancel policy, approval expiry, dashboard control, rollback, or verification command, when launch readiness is evaluated, then the refreshed packet marks launch blocked and names the missing input.
5. The story remains non-executing for subscription-agent launch authority: it may add documentation and run repo verification, but it must not add subscription-agent process launch, worker shell command execution, worker source mutation, provider/model calls, credential/session access, worker network expansion, issue sync, PR/merge/cleanup execution, or broad autonomy.

## Tasks / Subtasks

- [x] Create the refreshed subscription-agent launch approval packet. (AC: 1, 2, 3, 4, 5)
  - [x] Add a durable markdown artifact under `docs/goals/` using the naming pattern `epic-8-subscription-agent-launch-approval-packet-YYYY-MM-DD.md`.
  - [x] Summarize Epic 7 reusable controls: green-gate readiness, bounded launch contract, diff guard, verification evidence, Dev Console readiness, action eligibility, and latest-attempt evidence binding.
  - [x] Map Story 5.5 acceptance criteria to Epic 8 stories and unresolved approvals.
- [x] Preserve the current stop line. (AC: 2, 4, 5)
  - [x] State that real subscription-agent process launch remains blocked until a later exact approval packet names target, command template, environment allowlist, artifact limits, timeout/cancel policy, approval expiry, dashboard controls, rollback, and verification.
  - [x] State that Stories 8.1-8.4 remain non-executing for real subscription-agent process launch; later approval must be requested by Story 8.5 or a successor story, not by changing the boundary of 8.1-8.4.
  - [x] Include denied authorities: source mutation, credential/session inheritance, provider/model calls, network expansion, issue sync, PR/merge/cleanup execution, Claude launch, failed-check bypass, and broad autonomy.
- [x] Add machine-checkable planning evidence. (AC: 1, 3, 4)
  - [x] Add a compact checklist or table in the packet with columns for launch gate, current evidence, Epic 8 owner story, status, and missing approval.
  - [x] Ensure every missing approval has a stable operator-readable blocked reason.
  - [x] Ensure the packet distinguishes evidence that exists from evidence that is only planned.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record implementation notes in this story file.
  - [x] Record verification commands and results.

### Review Findings

- [x] [Review][Patch] Clarify non-executing stop line applies to subscription-agent launch authority, not ordinary repo documentation edits or verification [docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md:22]
- [x] [Review][Patch] Remove escape hatch that could make Stories 8.1-8.4 executing before Story 8.5 [docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md:32]
- [x] [Review][Patch] Add missing approval actor and approval timestamp to exact launch envelope [docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md:68]
- [x] [Review][Patch] Expand stale invalidators to cover every required approval envelope field [docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md:91]
- [x] [Review][Patch] Add stable blocker rows for timeout/cancel policy, approval expiry, and verification command [docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md:50]
- [x] [Review][Patch] Add orphan detection, terminal-state reconciliation, and idempotent cleanup to required launch planning [docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md:84]
- [x] [Review][Patch] Mark future Epic 8 story map entries as placeholders with no approved scope until story files exist [docs/stories/index.md:185]

## Dev Notes

### Product Intent

Epic 8 exists because Story 5.5 is the only explicitly deferred story after Epic 7 closeout. Epic 7 made supervised execution safer, but it did not approve subscription-agent process launch. Story 8.1 turns that new readiness into a reviewable approval packet without crossing the launch boundary.

This story is not the launch. It is a planning and approval artifact story.

### Existing Source Material

- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
  - Deferred source requirement.
  - Requires exact approved target/command, non-stale approval binding, isolated workspace, environment allowlist, credential/session denial, bounded output artifacts, lifecycle state, dashboard state, runtime export, rollback, and tests.
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
  - Status remains draft/reviewed/not approved for implementation.
  - Direct launch remains disabled until a successor decision record is explicitly approved and converted into implementation stories.
  - Required gates before implementation include target/template, workspace behavior, approval binding/expiry, session boundary, output limits, timeout/cancel/orphan cleanup, dashboard controls, runtime evidence export, and rollback/global disable.
- `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`
  - No concrete launch target is approved.
  - First implementation should be artifact-only or patch-only.
  - No arbitrary environment inheritance is approved.
  - Approvals must expire by time and by evidence changes.
- `_bmad-output/implementation-artifacts/epic-7-retro-2026-06-12.md`
  - Epic 7 completed green-gate, launch-contract, diff-guard, verification, Dev Console readiness, and PR/merge/cleanup eligibility work.
  - Lesson: a green gate is only meaningful when bound to exact work item, attempt, approved scope, and latest verification evidence.

### Architecture Guardrails

- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
  - Process launch attaches to `ExecutionAttempt`, not `QueueLease`.
  - Lifecycle states: `planned`, `approved`, `starting`, `running`, `cancel_requested`, `cancelled`, `timed_out`, `failed`, `completed`.
  - Direct launch remains denied until exact target and tests are approved.
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
  - Current implementation is control-plane only.
  - Real subscription-agent launch, provider/model calls, arbitrary commands, source mutation, worker network access, credential access, broad snapshot export, and background assistant behavior remain deferred.
  - Reuse stable rejection reasons where possible, especially `subscription_agent_process_launch_not_enabled`.
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
  - Dashboard is an operator control plane, not independent execution authority.
  - Subscription-agent launch is currently an execution-prohibited display.
  - UI copy must state when process launch, provider calls, commands, source mutation, network access, or credential access remain disabled.

### Existing Epic 7 Surfaces To Reference

Use Epic 7 implementation evidence as reusable control context, not as launch approval:

- Story 7.1: green-gate delivery readiness contract.
- Story 7.2: bounded Codex launch contract and stale/mismatch rejection pattern.
- Story 7.3: out-of-scope diff guard scoped to approved paths.
- Story 7.4: first supervised Codex launch evidence and stop lines.
- Story 7.5: verification result and recovery evidence.
- Story 7.6: Dev Console readiness based on real persisted evidence.
- Story 7.7: PR/merge/cleanup eligibility as reporting-only states.

### Implementation Guidance

- Prefer one durable packet document over scattered updates in multiple PRD/architecture files for this story.
- Do not edit the PRD to imply real launch approval.
- Do not add backend process supervisor code, dashboard launch buttons, command templates, environment inheritance, shell execution, or worker launch routes in this story.
- If referencing current code surfaces, keep the story read-only and evidence-only. This story can inspect or cite existing contracts and reports, but should not change execution behavior.
- Use explicit blocked language: "blocked until exact approval names X" rather than "ready" when a gate is still missing.
- The packet should be good enough for Story 8.2 to turn missing approvals into a concrete launch envelope.

### Testing

- Documentation/story artifact checks:
  - `pnpm.cmd run check:docs`
- Broader safety verification if any generated indexes or contracts are touched:
  - `pnpm.cmd run check`
- No live subscription-agent process, provider, network, credential, GitHub mutation, PR/merge/cleanup, or source-mutation verification is allowed for this story.

### References

- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `_bmad-output/implementation-artifacts/epic-7-retro-2026-06-12.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-12.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Focused docs verification: `pnpm.cmd run check:docs` initially failed because `docs/stories/index.md` referenced planned Epic 8 story files that do not exist yet.
- Focused docs verification: `pnpm.cmd run check:docs` passed after changing future Epic 8 entries to planned story titles while keeping the Story 8.1 file reference.
- Full verification: `pnpm.cmd run check` passed, including documentation drift checks, dashboard production build, and 153 supervisor integration tests with 1 existing aiosqlite deprecation warning.
- Review-fix verification: `pnpm.cmd run check:docs` passed.
- Review-fix full verification: `pnpm.cmd run check` passed, including dashboard production build and 153 supervisor integration tests with 1 existing aiosqlite deprecation warning.

### Completion Notes List

- Created `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md` as a non-executing refreshed approval packet.
- Mapped deferred Story 5.5 launch gates to Epic 8 owner stories, current evidence, status, and stable missing-approval blocked reasons.
- Preserved the stop line: real subscription-agent process launch, shell execution, source mutation, provider/model calls, credential/session inheritance, network expansion, issue sync, PR/merge/cleanup execution, Claude launch, failed-check bypass, and broad autonomy remain denied.
- Updated `docs/stories/index.md` with a Draft Epic 8 story map while avoiding references to future story files that have not been created.
- Resolved code-review findings by clarifying the documentation/verification exception to the non-executing stop line, removing the Story 8.1-8.4 execution escape hatch, adding approval actor/timestamp, expanding stale invalidators, adding stable blocker rows for timeout/expiry/verification, adding orphan/reconciliation/idempotent cleanup gates, and marking future Epic 8 entries as placeholders.

### File List

- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/stories/8-1-refresh-subscription-agent-launch-approval-packet-from-epic-7-evidence.md`
- `docs/stories/index.md`

## Change Log

- 2026-06-12: Implemented Story 8.1 approval packet refresh, Epic 8 story map index update, focused docs verification, and full project verification; status moved to review.
- 2026-06-12: Addressed seven code-review findings, reran focused docs and full project verification, and marked the story done.
