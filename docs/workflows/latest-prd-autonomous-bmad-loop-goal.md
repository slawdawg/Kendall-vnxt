# Latest PRD Autonomous BMAD Loop Goal

Date: 2026-07-02
Status: completed goal prompt

## Current Use Warning

Do not use this artifact to consolidate or clean up the remaining stale managed
workspaces from July 1-2. That work is governed by
`docs/workflows/active-workspace-consolidation-goal-2026-07-03.md`.

This file remains the completed July 2 PRD execution goal. The July 2 PRD is
complete according to the artifacts listed below, so using this prompt for
active workspace cleanup would restart the wrong workflow and may recreate
orphaned worktrees.

## Purpose

Give the operator a durable prompt for starting or resuming a long-running
Kendall manager run that completes the current authoritative PRD through the
BMAD loop: sprint planning, story creation, implementation, review, correction
when needed, and retrospective. This artifact should survive context resets and
replace any older "complete the last PRD" goal prompt for active implementation
work.

Current target PRD:
`_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/prd.md`
(`Kendall_Nxt Live Pipeline Backend Projection and Fixture Retirement`).
This PRD supersedes the prior July 1 manager-control-plane implementation goal
for current active work. The July 1 PRD remains historical context and parent
input, but all new implementation work for this goal should come from the July
2 live `/pipeline` projection PRD, its architecture, epics/stories, sprint
status, and child stories. The goal is not complete until every July 2 PRD
story is done or explicitly retired through BMAD correct-course.

This artifact is source-owned so future Codex sessions should use it instead of
relying on chat memory. It does not replace `AGENTS.md`, the matching BMAD
skills, `docs/workflows/end-to-end-lane-runner.md`, or the
`kendall-manager-control-plane` skill. Those remain the behavioral authorities.

## Goal Prompt

Paste this as the goal:

```text
Goal: Use the Kendall manager/dispatcher to complete the July 2 authoritative PRD end to end through BMAD execution loops.

Authoritative PRD:
_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/prd.md

Current slice:
Kendall_Nxt Live Pipeline Backend Projection and Fixture Retirement. Complete the backend-truth-first `/pipeline` slice so the dashboard shows real backend WorkPackets, manager state, queue state, freshness/stale/unavailable/fixture truth labels, packet detail/evidence, and dogfood proof without silently substituting fixtures for live work.

Planning inputs:
- PRD: _bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/prd.md
- PRD addendum: _bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/addendum.md
- Architecture: _bmad-output/planning-artifacts/architecture.md
- Epics/stories: _bmad-output/planning-artifacts/epics.md
- Sprint status: _bmad-output/implementation-artifacts/sprint-status.yaml
- Completed first story: _bmad-output/implementation-artifacts/1-1-backend-projection-contract-and-endpoint.md
- Completed second story: _bmad-output/implementation-artifacts/1-2-dashboard-projection-fetch-and-truth-summary.md
- Completed third story: _bmad-output/implementation-artifacts/1-3-stage-level-empty-stale-and-source-state-labels.md
- Completed fourth story: _bmad-output/implementation-artifacts/1-4-manager-summary-and-inactivity-explanation.md
- Completed fifth story: _bmad-output/implementation-artifacts/1-5-explicit-fixture-mode-and-no-fake-progress-guardrails.md
- Completed Epic 1 retrospective: _bmad-output/implementation-artifacts/epic-1-retro-2026-07-02.md
- Completed sixth story: _bmad-output/implementation-artifacts/2-1-real-workpacket-stage-rendering.md
- Completed seventh story: _bmad-output/implementation-artifacts/2-2-packet-detail-from-backend-projection.md
- Completed eighth story: _bmad-output/implementation-artifacts/2-3-cleanup-and-takeover-gate-visibility.md
- Completed ninth story: _bmad-output/implementation-artifacts/2-4-real-workpacket-backend-proof-path.md
- Completed Epic 2 retrospective: _bmad-output/implementation-artifacts/epic-2-retro-2026-07-02.md
- Completed tenth story: _bmad-output/implementation-artifacts/3-1-fixture-as-live-regression-tests.md
- Completed eleventh story: _bmad-output/implementation-artifacts/3-2-projection-state-test-coverage.md
- Completed twelfth story: _bmad-output/implementation-artifacts/3-3-dogfood-evidence-and-slice-handoff.md
- Completed Epic 3 retrospective: _bmad-output/implementation-artifacts/epic-3-retro-2026-07-02.md
- Completed final July 2 PRD completion audit: _bmad-output/implementation-artifacts/latest-prd-live-projection-completion-audit-2026-07-02.md
- Current next BMAD step at this artifact update: none for this PRD; start a new source-owned PRD or BMAD correct-course packet for follow-up work.

First repair any manager state, ledger, sprint-status discovery, dispatcher queue, stale ownership, dirty workspace preservation, worker warm-start, usage, resource, and tmux-orientation blockers needed for safe autonomous operation. Treat this setup repair as part of the goal, not a separate optional task.

On resume, trust `_bmad-output/implementation-artifacts/sprint-status.yaml`
over this prose for exact status. As of this artifact update, Stories 1.1
through 1.5 are `done`, Epic 1 retrospective is `done`, Stories 2.1 through
2.4 are `done`, Epic 2 is `done`, the Epic 2 retrospective is `done`, and
Stories 3.1, 3.2, and 3.3 are `done`. Epic 3 retrospective is `done`.
The final July 2 PRD completion audit is done.
Do not pause after one story unless no safe work
remains or an explicit stop condition is reached.

Completion target:
Complete every story in `_bmad-output/implementation-artifacts/sprint-status.yaml`
that belongs to the July 2 PRD and is not marked `done`, unless a BMAD
correct-course explicitly retires or replaces it. If sprint status, story files,
and this prompt disagree, use sprint status plus the story file as the
operational truth and update this artifact only when the handoff would
otherwise mislead the next session.

Then run continuously, using up to 6 manager-owned Codex workers when safe work supply, Codex 5-hour usage, weekly usage signals, CPU, and RAM allow. Do not maximize worker count when safe work supply is low or when merge conflict risk would waste work. Prefer 2-4 workers for tightly coupled stories and scale toward 6 only when the work is genuinely parallel.

For each work item from the July 2 authoritative PRD, follow this loop:
$bmad-sprint-planning when sprint tracking needs refresh ->
$bmad-create-story for the next backlog story ->
$bmad-dev-story to implement the story completely ->
$bmad-code-review to review the implementation ->
$bmad-dev-story again for required review fixes ->
$bmad-correct-course if implementation reveals material PRD, architecture, UX, or story changes ->
$bmad-retrospective after each completed epic.

Complete these epics and stories unless a BMAD correct-course explicitly retires
or replaces them. Status snapshot at this artifact update: Stories 1.1 through
1.5 are done, Epic 1 retrospective is done, Stories 2.1 through 2.4 are done,
Epic 2 and its retrospective are done, Stories 3.1 through 3.3 are done, Epic 3
retrospective is done, and the final completion audit is done.
- Epic 1: Pipeline Truth and Freshness Visibility
  - Story 1.1: Backend Projection Contract and Endpoint [done]
  - Story 1.2: Dashboard Projection Fetch and Truth Summary [done]
  - Story 1.3: Stage-Level Empty, Stale, and Source State Labels [done]
  - Story 1.4: Manager Summary and Inactivity Explanation [done]
  - Story 1.5: Explicit Fixture Mode and No-Fake-Progress Guardrails [done]
  - Epic 1 retrospective [done]
- Epic 2: Real WorkPacket Operations View
  - Story 2.1: Real WorkPacket Stage Rendering [done]
  - Story 2.2: Packet Detail from Backend Projection [done]
  - Story 2.3: Cleanup and Takeover Gate Visibility [done]
  - Story 2.4: Real WorkPacket Backend Proof Path [done]
  - Epic 2 retrospective [done]
- Epic 3: Fixture Retirement, Regression Proof, and Handoff
  - Story 3.1: Fixture-as-Live Regression Tests [done]
  - Story 3.2: Projection State Test Coverage [done]
  - Story 3.3: Dogfood Evidence and Slice Handoff [done]
  - Epic 3 retrospective [done]

Code review is not complete when findings are merely recorded. For every
review-ready lane, run `$bmad-code-review`, write findings to the story, apply
or dispatch all unambiguous patch findings, rerun focused verification, rerun
code review, and repeat until the review is clean or only explicitly deferred /
operator-gated items remain. If a finding requires a product or authority
decision, keep that lane blocked with a concise question and continue other safe
work instead of stopping the whole manager.

Keep the queue full from the July 2 PRD while implementation backlog remains. If safe backlog gets low, create the next story or planning artifact from approved PRD/BMAD sources instead of letting workers idle. Once Story 3.3 is in review or done and no July 2 PRD backlog remains, do not create post-slice work just to keep workers busy; proceed only to review fixes, Epic 3 retrospective, final audit, or a separately approved next source-owned PRD. Split stories into parallel child lanes only when the split is technically safe, preserves BMAD acceptance criteria, reduces elapsed time, and has low merge conflict risk. Otherwise keep the story as one lane.

Prioritize backend truth first, then visible UX. Do not broaden the slice into a
new workflow engine, autonomy expansion, route-line semantics, or decorative UI
redesign. The `/pipeline` route should remain a compact operations dashboard:
real backend state, truthful empty/stale/unavailable/fixture labels, actionable
packet detail, and clear ready-to-test evidence.

Use task-fit model selection: choose the best model expected to complete the work correctly with the least token waste. Do not downgrade quality just to save usage. At or below 2% Codex 5-hour remaining usage, enter manager-only mode, stop dispatching new worker work, and let safe active workers checkpoint or finish only when appropriate.

Report concise progress every few minutes with worker count, current story/epic, blockers needing operator action, usage/resource posture, and user-facing work ready to test. Do not ask for direction unless blocked, high-risk, or scope/authority expands.

Standing authority for this goal:
- run manager preflight, resume, cycle, ledger repair, dispatcher, refill, warm-worker, handoff, progress, review, and safe cleanup dry-run scripts;
- launch, monitor, answer, repair, retire, or restart manager-owned Codex workers only;
- create and update BMAD local planning/story/review/retro artifacts under _bmad-output;
- complete BMAD code-review cycles by applying unambiguous review patch findings, dispatching correction work, rerunning focused verification, and rerunning review until clean or explicitly gated;
- edit source code, tests, docs, and repo policy needed to complete PRD stories;
- run local verification commands;
- create managed worktrees and branches for lanes;
- open/update PRs and perform low-risk delivery only when repo policy gates are satisfied.

Stop for explicit approval before secrets, credentials, provider account/payment changes, production deploys, destructive cleanup outside manager-owned workspaces, force-push/history rewrite, unknown process termination, unresolved dirty workspace takeover, schema/database migration with residual risk, or merging a PR that does not satisfy the low-risk delivery criteria.

Definition of done:
All stories from the July 2 authoritative PRD are done or explicitly retired through approved correct-course, all required review findings have been fixed, explicitly deferred, or operator-gated, all required epics have retrospectives, sprint-status is accurate, tests/checks are green or documented with accepted residual risk, manager/dispatcher state is healthy, and a final report lists completed user-facing work, remaining risks, verification evidence, and how I can test the result.

User-facing completion proof must include:
- `/pipeline` shows whether data is live, stale, unavailable, fixture, simulated, dry-run, or unknown.
- Real backend WorkPackets render in the correct stage lanes when they exist.
- Backend-empty/source-exhausted state is explicit and does not show fake work.
- Manager/queue summary explains active leases, workers, dispatchable/blocked/closed counts, and inactivity reason.
- Packet detail opens from backend projection data with source refs, blocker/next action, evidence refs, truth label, and testability state.
- Fixture data cannot satisfy live proof and is visibly labeled whenever it appears.
- A dogfood evidence artifact proves at least one non-fixture backend projection path or explains why none exists with accepted residual risk.
```

## Operating Notes

- The manager should use the July 2 PRD above as the current authoritative PRD.
  If a newer PRD appears authoritative or a PRD supersession conflict exists,
  stop for a concise operator decision.
- Sprint status currently lives at
  `_bmad-output/implementation-artifacts/sprint-status.yaml`; resume from the
  first story not marked `done`. As of this artifact update, Stories 1.1
  through 1.5 are done, Epic 1 retrospective is done, Stories 2.1 through 2.4
  are done, Epic 2 is done, Epic 2 retrospective is done, Epic 3 is
  done, Stories 3.1 through 3.3 are done, and the Epic 3 retrospective is done.
- Generated BMAD work products stay local under `_bmad-output/`. Durable repo
  decisions must be rewritten into source-owned docs, scripts, tests, or policy.
- Manager state repair is in scope because stale ledger/workspace state can
  block worker launch even when usage and CPU/RAM are healthy.
- Worker dispatch is bounded by useful parallelism, not by the configured max
  worker count. Six workers is a ceiling, not a target for every story.
- This PRD has UI-facing outcomes, so stories that touch `/pipeline` must
  preserve the existing compact dashboard intent and verify visible behavior,
  but backend projection truth remains the first priority.
- The manager must preserve metadata-only evidence and must not retain raw
  prompts, completions, reasoning traces, provider payloads, secrets, or
  unnecessary source copies.

## First Checks

Before launching or resuming workers, run the manager skill's compact checks:

```bash
node ./scripts/manager-preflight.mjs --summary-json
node ./scripts/manager-resume-state.mjs --summary-json
node ./scripts/manager-cycle-packet.mjs --summary-json
```

If sandbox restrictions make these checks inconclusive, rerun the same
read-only checks outside the sandbox with approval and keep the output
metadata-only.

## Success Report

The final report should include:

- Latest PRD source used.
- Epics and stories completed, retired, or still blocked.
- `/pipeline` behavior that is ready for the operator to test.
- Worker utilization summary and why fewer than six workers were used, if
  applicable.
- User-facing work ready to test.
- Verification commands and results.
- Correct-course decisions and retrospective links.
- Remaining risks and next recommended goal, if any.
