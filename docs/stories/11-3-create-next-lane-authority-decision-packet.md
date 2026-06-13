---
baseline_commit: 15d0ee9
---

# Story 11.3: Create Next-Lane Authority Decision Packet

Status: done

## Story

As Bob,
I want a current decision packet comparing the next candidate authority lanes,
so that provider calls, subscription-agent launch, premium execution, adaptive scoring, or delivery cleanup automation are not chosen by stale defaults.

## Acceptance Criteria

1. Given the project has multiple possible next authority lanes, when Kendall prepares the decision packet, then it compares at least local provider calls, direct subscription-agent process launch, premium execution, adaptive scoring, and delivery cleanup automation and names readiness evidence, missing gates, blast radius, rollback path, retained evidence, and explicit approval language for each lane.
2. Given a lane lacks a current exact approval, when the decision packet is produced, then the lane remains blocked and the packet contains no implementation task that would execute the lane.
3. Given Bob later approves one lane, when the next story is created, then the story scope must match the packet's exact authority family, operation, target, stop lines, evidence, and rollback path.
4. Given Story 11.2 refreshed the authority readiness matrix, when the decision packet cites readiness evidence, then it uses the refreshed matrix family IDs, statuses, required approvals, required evidence, related docs/reports, stop lines, and rollback paths instead of older stale lane labels.
5. Given the packet changes documentation or checked report text, when verification runs, then `pnpm.cmd run check:docs` and any touched drift check pass.

## Tasks / Subtasks

- [x] Create the next-lane authority decision packet. (AC: 1-4)
  - [x] Add a dated packet under `docs/goals/`, recommended path `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`.
  - [x] Include a comparison table for local provider calls, direct subscription-agent process launch, premium execution, adaptive scoring, and delivery cleanup automation.
  - [x] For every lane, name authority family, operation candidate, current status, readiness evidence, missing gates, blast radius, rollback path, retained evidence, stop lines, and exact approval language.
  - [x] Use Story 11.2 authority readiness family IDs where applicable: `local-provider-execution`, `subscription-agent-launch`, `premium-execution`, `adaptive-scoring`, `github-delivery`, and `cleanup-automation`.
  - [x] Keep all lanes blocked or approval-required unless an exact current approval packet exists.
- [x] Preserve authority boundaries. (AC: 2-3)
  - [x] State that the packet is decision-only and does not execute provider calls, process launch, premium calls, scoring, PR/merge/cleanup, branch deletion, worktree deletion, issue sync, source mutation, credentials, network expansion, failed-check bypass, or broad autonomy.
  - [x] Include required future story-scope binding: any successor story must copy the exact authority family, operation, target, evidence, stop lines, and rollback path from the chosen packet lane.
  - [x] Include an explicit stale-approval rule: generic continuation language and old approvals cannot authorize a new lane.
- [x] Reconcile supporting indexes or architecture notes. (AC: 4-5)
  - [x] Update `docs/stories/index.md` with Story 11.3.
  - [x] Update `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md` only if needed to point next-lane planning at the new decision packet.
  - [x] Update any existing drift check only if the changed packet/report text is already guarded or should be guarded.
- [x] Verify and record evidence. (AC: 1-5)
  - [x] Run `pnpm.cmd run check:docs`.
  - [x] Run any touched drift check if implementation changes a guarded surface.
  - [x] Run `pnpm.cmd run check` before PR if the story touches shared report code, dashboard code, contracts, schemas, package scripts, or existing drift-check requirements.
  - [x] Record verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log when implementation is complete.

### Review Findings

- [x] [Review][Patch] Reword the recommendation so no lane is implicitly selected or authorized.
- [x] [Review][Patch] Add packet freshness and same-day re-check requirements for PR, CI, review, and lane-readiness evidence.
- [x] [Review][Patch] Replace ambiguous retention-expansion wording with exact approval requirements for any non-metadata retention.
- [x] [Review][Patch] Add required-evidence fields to every exact approval template.
- [x] [Review][Patch] Include exact Story 11.2 status tokens in every lane row.
- [x] [Review][Patch] Broaden the architecture label from provider/process/premium to the full next-lane authority decision packet scope.
- [x] [Review][Patch] Add timestamped PR #103 verification evidence to the story record.
- [x] [Review][Patch] Add per-lane related reports and documents from the refreshed Story 11.2 matrix.

## Dev Notes

### Source Context

- Epic 11 selects the next authority lane from current evidence, not stale blocked-story text.
- Story 11.1 reconciled stale PRD, architecture, story, sprint, and PR-state claims after Epic 10.
- Story 11.2 refreshed the authority readiness matrix with current provider, process-launch, premium, adaptive scoring, worker-authority, GitHub delivery, and cleanup evidence.
- PR #103 is still the outer Epic 10 delivery PR to `main`. After Story 11.2 merged into its branch, PR #103 CI passed again on 2026-06-13, but GitHub still reports it externally review-gated. Re-check PR #103 before claiming merge to `main`.
- The decision packet should be human-readable and implementation-safe: it helps choose a lane but does not authorize or execute a lane.

### Existing Implementation And Artifacts To Reuse

- Current authority readiness matrix:
  - `GET /supervisor/authority-readiness-matrix-report`
  - `services/supervisor/src/supervisor/application/service.py`
  - `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx`
  - `docs/stories/11-2-refresh-authority-readiness-matrix-from-current-evidence.md`
- Current approval and readiness packet patterns:
  - `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
  - `docs/goals/epic-6-real-story-trial-approval-packet-2026-06-11.md`
  - `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
  - `docs/architecture/kendall-vnxt-authority-dependency-graph-2026-06-08.md`
- Current reconciliation and lane context:
  - `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
  - `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
  - `docs/prds/index.md`
  - `docs/stories/index.md`

### Required Lane Comparison Content

For each lane, include:

- authority family and exact candidate operation,
- current status,
- readiness evidence,
- missing gates,
- blast radius,
- retained evidence,
- rollback path,
- stop lines,
- exact approval language Bob would need to use,
- successor-story scope binding.

Minimum lanes:

- Local provider calls:
  - Family: `local-provider-execution`.
  - Must remain blocked unless a provider-specific approval names endpoint, model, authority scope, prompt/retention policy, evidence, stop lines, and rollback.
- Direct subscription-agent process launch:
  - Family: `subscription-agent-launch`.
  - Must distinguish Story 8.5 artifact-only fixture launch evidence from broader production process launch authority.
- Premium execution:
  - Family: `premium-execution`.
  - Must require provider, cost ceiling, data policy, audit evidence, stop lines, and rollback before any paid call.
- Adaptive scoring:
  - Family: `adaptive-scoring`.
  - Must require scoring inputs, output use, retained evidence, review path, stop lines, and rollback before any score can affect priority, launch, delivery, cleanup, or authority state.
- Delivery cleanup automation:
  - Families: `github-delivery` and `cleanup-automation`.
  - Must distinguish human/connector-backed PR work from worker remote automation and destructive cleanup.

### Previous Story Intelligence

- Story 11.2 review found that "ready" wording can imply permission. Use `approval-required`, `blocked`, or `decision-only` wording unless authority is actually approved.
- Story 11.2 review also found that every authority row needs complete evidence cross-links and rollback paths. The decision packet must not leave blank gates or vague recovery language.
- Story 10.5 hardened delivery approval binding against authority-looking identifiers. The decision packet must require trusted approval-ledger evidence where delivery/cleanup authority is involved.
- Story 8.5 approval was exact and narrow: artifact-only fixture path only. Do not reuse it for direct subscription-agent process launch.

### Architecture And Safety Boundaries

- This story is documentation and decision-packet preparation only unless implementation explicitly adds a read-only report or drift check. It must not execute provider calls, launch subscription-agent processes, perform premium execution, run adaptive scoring, mutate GitHub, merge PRs, delete worktrees, delete branches, sync issues, access credentials, mutate source by workers, bypass failed checks, or grant broad autonomy.
- No decision packet text may tell the developer to implement or execute a lane before Bob supplies a current exact approval.
- Approval language must name authority family, operation, scope, target, evidence, rollback path, stop lines, and expiry or review point.
- Evidence remains metadata-only. Do not add raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, or unbounded command output.

### Implementation Guidance

- Prefer a docs-first packet unless a currently guarded surface requires a matching static check update.
- Start with inventory:
  - `rg -n "authority readiness|authority lane|approval packet|Story 11.2|PR #103|premium|adaptive scoring|cleanup automation|subscription-agent launch|local provider" docs services apps scripts tests`
- Use clear tables rather than prose-only packets so the next story can copy exact lane scope.
- Keep exact approval language as proposed language, not accepted approval.
- If a "recommended lane" is included, label it as an operator decision candidate, not execution permission.
- If implementation adds a drift check for the packet, wire it into `package.json` and `pnpm.cmd run check` only if the check protects a stable artifact that must not drift.

### Testing

Minimum focused verification:

- `pnpm.cmd run check:docs`

Run additional checks only if their guarded files change:

- `pnpm.cmd run check:authority-readiness`
- `pnpm.cmd run check:documentation-authority`
- `pnpm.cmd run check:reports`

Broaden before PR if changes touch shared code, dashboard/report code, package scripts, or existing drift checks:

- `pnpm.cmd run check`

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13-epic-11-current-state-reconciliation.md`
- `docs/stories/11-1-reconcile-planning-status-after-epic-10-delivery.md`
- `docs/stories/11-2-refresh-authority-readiness-matrix-from-current-evidence.md`
- `docs/goals/epic-8-subscription-agent-launch-approval-packet-2026-06-12.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-authority-dependency-graph-2026-06-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` from Epic 11 backlog after Story 11.2 refreshed authority readiness matrix evidence and merged via PR #106 into the Epic 10 delivery branch.
- Documentation verification passed: `pnpm.cmd run check:docs`.
- Full regression passed: `pnpm.cmd run check`, including dashboard build and 195 supervisor tests with one existing aiosqlite deprecation warning.
- BMAD party-mode code review ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor; accepted findings were patched.
- PR #103 current-state verification ran: `gh pr view 103 --json state,mergeStateStatus,reviewDecision,statusCheckRollup,url,headRefName,baseRefName,latestReviews`. Result on 2026-06-13: PR open, head `codex/epic-10-delivery-cleanup-plans`, base `main`, CI `check` success completed at `2026-06-13T17:38:44Z`, `mergeStateStatus=BLOCKED`, latest review `COMMENTED`.
- Post-review documentation verification passed: `pnpm.cmd run check:docs`.

### Completion Notes List

- Created `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md` as a decision-only comparison for local provider calls, direct subscription-agent process launch, premium execution, adaptive scoring, GitHub delivery, and cleanup automation.
- Used Story 11.2 authority readiness family IDs, statuses, evidence, missing gates, retained evidence, rollback paths, stop lines, and exact approval-language templates.
- Preserved blocked/approval-required authority boundaries and stated that the packet does not execute, approve, launch, call, score, merge, clean up, delete, sync, mutate, or automate any lane.
- Added successor-story binding rules so a future approved story must match the chosen lane's authority family, operation, target/scope, evidence, stop lines, retained evidence, rollback path, and expiry/review point.
- Updated architecture reconciliation to point next-lane planning at the new decision packet.
- Patched BMAD review findings by adding freshness expiry, exact status tokens, required-evidence approval fields, related docs/reports, tighter retention language, non-authorizing recommendation wording, broader architecture label, and PR #103 verification evidence.

### Review Findings

- [x] Recommendation now says the adaptive-scoring lane is only for Bob to consider and that no lane is selected or authorized without exact approval.
- [x] Packet freshness rule now requires same-day PR, CI, review, and lane-readiness re-check before implementation use.
- [x] Retention rule now requires exact approval for any non-metadata retention and names prohibited data classes.
- [x] Exact approval templates now include `required evidence <required-evidence>`.
- [x] Lane rows include exact Story 11.2 status tokens such as `blocked_pending_explicit_approval` and `evidence_ready_approval_required`.
- [x] Architecture reconciliation now labels the full next-lane authority decision packet scope.
- [x] Story record includes timestamped PR #103 verification evidence.
- [x] Packet includes per-lane related reports and related docs from the refreshed matrix.

### File List

- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/stories/11-3-create-next-lane-authority-decision-packet.md`
- `docs/stories/index.md`

## Change Log

- 2026-06-13: Created Story 11.3 and moved it to ready-for-dev.
- 2026-06-13: Implemented the decision-only next-lane authority packet and moved Story 11.3 to review.
- 2026-06-13: Patched BMAD code-review findings, verified docs, and moved Story 11.3 to done.
