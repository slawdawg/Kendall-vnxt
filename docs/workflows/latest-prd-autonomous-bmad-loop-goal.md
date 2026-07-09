# Generic PRD Autonomous BMAD Loop Goal

Date: 2026-07-04
Status: active reusable goal template

## Purpose

This is the durable goal artifact for running the Kendall manager against any
approved authoritative PRD. It replaces one-off "complete the latest PRD" chat
prompts and must not hard-code a historical PRD as the active source.

Use this artifact when the operator wants the `kendall-manager-control-plane`
skill to complete a PRD end to end through:

`bmad-sprint-planning -> bmad-create-story -> bmad-dev-story -> bmad-code-review -> bmad-dev-story fixes -> bmad-correct-course when needed -> bmad-retrospective at epic close`

This artifact is a source-owned operating contract. BMAD-generated PRDs,
epics, stories, readiness reports, reviews, retrospectives, and handoffs remain
local planning state under `_bmad-output/`.

## Source Resolution

The manager must resolve the target PRD before starting or resuming the loop.
Use this precedence order:

1. An explicit operator-supplied PRD path or source bundle.
2. A source bundle from the current manager cycle packet or refill packet.
3. The newest local BMAD PRD marked authoritative/final that has matching
   completed architecture, epics/stories, and implementation-readiness artifacts.

Stop for a concise operator decision when:

- Two candidate PRDs both appear active and neither clearly supersedes the
  other.
- The selected PRD has no completed epics/stories artifact.
- Implementation readiness is missing or not complete.
- Sprint status points to a different PRD and cannot be safely regenerated.
- A prior completed goal artifact is the only evidence for active work.

For the current Operational Pipeline Action Loop slice, the resolved source
bundle is expected to be:

- PRD: `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md`
- PRD addendum: `_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/addendum.md`
- Architecture: `_bmad-output/planning-artifacts/architecture-operational-pipeline-action-loop-2026-07-04.md`
- Epics/stories: `_bmad-output/planning-artifacts/epics.md`
- Readiness report: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-04.md`
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml`

If a newer PRD supersedes this bundle, use the newer explicit source bundle
instead of the example above.

## Goal Prompt Template

Use this prompt shape for a manager run. Fill the source bundle from source
resolution; do not leave placeholders in a live worker handoff.

```text
Goal: Use the Kendall manager/dispatcher to complete the selected authoritative PRD end to end through BMAD execution loops.

Authoritative PRD:
<prd-path>

Current slice:
<prd-title-or-short-slice-summary>

Planning inputs:
- PRD: <prd-path>
- PRD addendum: <addendum-path-or-none>
- Architecture: <architecture-path>
- Epics/stories: <epics-path>
- Implementation readiness: <readiness-report-path>
- Sprint status: <sprint-status-path>

First repair any manager state, ledger, sprint-status discovery, dispatcher queue, stale ownership, dirty workspace preservation, worker warm-start, usage, resource, and tmux-orientation blockers needed for safe autonomous operation. Treat this setup repair as part of the goal, not a separate optional task.

On resume, trust the sprint-status file and story files over this prose for exact status. If sprint status, story files, and the prompt disagree, use sprint status plus story files as operational truth and update the durable goal artifact only when the handoff would otherwise mislead the next session.

Completion target:
Complete every story in the selected sprint-status file that belongs to the authoritative PRD and is not marked done, unless a BMAD correct-course explicitly retires or replaces it. Do not pause after one story unless no safe work remains or an explicit stop condition is reached.

Run continuously, using up to 6 manager-owned Codex workers when safe work supply, Codex 5-hour usage, weekly usage signals, CPU, and RAM allow. Do not maximize worker count when safe work supply is low or when merge conflict risk would waste work. Prefer 2-4 workers for tightly coupled stories and scale toward 6 only when the work is genuinely parallel.

For each work item from the authoritative PRD, follow this loop:
$bmad-sprint-planning when sprint tracking needs refresh ->
$bmad-create-story for the next backlog story ->
$bmad-dev-story to implement the story completely ->
$bmad-code-review delegated to a manager-owned worker to review the implementation ->
$bmad-dev-story again for required review fixes ->
$bmad-correct-course if implementation reveals material PRD, architecture, UX, or story changes ->
$bmad-retrospective after each completed epic.

Code review is not complete when findings are merely recorded. For every review-ready lane, delegate $bmad-code-review to a manager-owned worker when one is available, write compact findings to the story/runtime evidence, apply or dispatch all unambiguous patch findings, rerun focused verification, rerun delegated code review, and repeat until the review is clean or only explicitly deferred/operator-gated items remain. The manager should orchestrate, validate compact evidence, route feedback, and enforce delivery gates. In autonomous mode, no available reviewer is a hold or warm-worker problem, not automatic permission for manager-local review; manager-local review requires an explicit manual decision or a stop-line investigation where delegation is unsafe.

The manager must also delegate review-thread fixes, code-review patch findings,
CI-failure fixes, and retest loops. If delivery discovers an unresolved GitHub
review thread or another source-edit requirement, the manager routes the fix to
the owning worker or an existing manager feedback gate first. If no suitable
manager-owned `codex-*` worker is available, or the task is an independent
read-only audit, the manager may spawn a bounded worker subagent. Prefer
existing manager-owned workers over API subagents for implementation,
review-fix loops, and focused retesting so work stays in the manager ledger and
does not exhaust the separate subagent pool. The manager may inspect compact
evidence, verify results, and run coordinator-owned delivery evidence gates,
including low-risk merge and cleanup when `standard-delivery` repo policy
criteria are proven. It must not patch or retest the lane locally, or execute
delivery/cleanup outside those repo-authorized gates, unless the operator
explicitly approves an exception or no worker/subagent delegation mechanism is
available and all other safe progress is blocked. Any manager-local
patch/retest or delivery/cleanup exception must record the exception, reason,
touched files or operations, verification, and why waiting would block progress.

Keep the queue full from the authoritative PRD while implementation backlog remains. If safe backlog gets low, create the next story or planning artifact from approved PRD/BMAD sources instead of letting workers idle. When no PRD backlog remains, do not create post-slice work just to keep workers busy; proceed only to review fixes, required retrospectives, final audit, or a separately approved next source-owned PRD.

Split stories into parallel child lanes only when the split is technically safe, preserves BMAD acceptance criteria, reduces elapsed time, and has low merge conflict risk. Otherwise keep the story as one lane.

Prioritize backend truth first, then visible UX. Do not broaden the slice beyond the authoritative PRD. For /pipeline work, preserve the compact dashboard contract and put dense diagnostics behind details.

Use task-fit model selection: choose the best model expected to complete the work correctly with the least token waste. Do not downgrade quality just to save usage. At or below 2% Codex 5-hour remaining usage, enter manager-only mode, stop dispatching new worker work, and let safe active workers checkpoint or finish only when appropriate.

Report concise progress every few minutes with worker count, current story/epic, blockers needing operator action, usage/resource posture, and user-facing work ready to test. Do not ask for direction unless blocked, high-risk, or scope/authority expands.
```

## Standing Authority

Within the selected PRD scope, the manager may:

- Run manager preflight, resume, cycle, ledger repair, dispatcher, refill,
  warm-worker, handoff, progress, review, and safe cleanup dry-run scripts.
- Launch, monitor, answer, repair, retire, or restart manager-owned Codex
  workers only through existing manager gates.
- Create and update BMAD local planning/story/review/retro artifacts under
  `_bmad-output`.
- Complete BMAD code-review cycles by applying unambiguous review patch
  findings, dispatching correction work, rerunning focused verification, and
  rerunning review until clean or explicitly gated.
- Edit source code, tests, docs, and repo policy needed to complete PRD stories.
- Run local verification commands.
- Create managed worktrees and branches for lanes.
- Open/update PRs and perform low-risk delivery only when repo policy gates are
  satisfied.

Stop for explicit approval before:

- Secrets, credentials, tokens, provider account/payment, or credential-manager
  changes.
- Production deploys or release automation.
- Database/schema migrations with residual risk.
- Force-push or history rewrite.
- Unknown or non-manager-owned process termination.
- Lane ownership takeover without explicit approval evidence.
- Destructive cleanup outside manager-owned workspaces.
- Raw prompt, completion, reasoning trace, provider payload, secret, or
  unnecessary source-copy retention.
- Work creation without source-owned PRD/runway/story/doc evidence.
- Merging a PR that does not satisfy the low-risk delivery criteria in
  `AGENTS.md`.

## Definition Of Done

The PRD execution goal is done when:

- All stories from the selected authoritative PRD are done or explicitly retired
  through approved BMAD correct-course.
- Required review findings are fixed, explicitly deferred, or operator-gated.
- Required epics have retrospectives.
- Sprint status is accurate.
- Tests/checks are green or documented with accepted residual risk.
- Manager/dispatcher state is healthy or cleanly stopped with housekeeping
  complete.
- A final report lists completed user-facing work, remaining risks,
  verification evidence, and how the operator can test the result.

## User-Facing Completion Proof

The final report must include PRD-specific proof. For `/pipeline` PRDs, include:

- What `/pipeline` behavior changed.
- What work is ready for the operator to test.
- Whether data is live, stale, unavailable, fixture, simulated, dry-run, or
  unknown where relevant.
- Whether packet detail, blocker, next action, evidence, and testability state
  are source-backed.
- Why fewer than six workers were used, if applicable.

For non-UI PRDs, replace the `/pipeline` checks with the PRD's explicit success
metrics and user-facing or operator-facing proof.

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

- PRD source bundle used.
- Epics and stories completed, retired, or still blocked.
- User-facing work ready to test.
- Worker utilization summary.
- Verification commands and results.
- Correct-course decisions and retrospective links.
- Remaining risks and next recommended PRD or slice, if any.
