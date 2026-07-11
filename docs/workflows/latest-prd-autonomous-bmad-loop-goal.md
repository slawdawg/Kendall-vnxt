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

Code review is not complete when findings are merely recorded. For every review-ready lane, delegate $bmad-code-review to a manager-owned worker when one is available, write compact findings to the story/runtime evidence, apply or dispatch all unambiguous patch findings, rerun focused verification, rerun delegated code review, and repeat until the review is clean or only explicitly deferred/operator-gated items remain. The manager should orchestrate, validate compact evidence, route feedback, and enforce delivery gates. Implementation, verification, review, review-fix, and delivery execution remain worker/subagent responsibilities; the manager session must not perform them locally. In autonomous mode, no available reviewer is a hold or warm-worker problem, not automatic permission for manager-local review; manager-local review requires an explicit manual decision or a stop-line investigation where delegation is unsafe.

The manager must also delegate review-thread fixes, code-review patch findings,
CI-failure fixes, retest loops, and delivery/cleanup execution. If delivery
discovers an unresolved GitHub review thread or another source-edit requirement,
the manager routes the fix to the owning worker or an existing manager feedback
gate first. If no suitable manager-owned `codex-*` worker is available, or the
task is an independent read-only audit, the manager may spawn a bounded worker
subagent. Prefer existing manager-owned workers over API subagents for
implementation, review-fix loops, focused retesting, and delivery so work stays
in the manager ledger and does not exhaust the separate subagent pool. The
manager may inspect compact evidence, run orchestration gates, and record
results, but must not patch, retest, review, merge, or clean up the lane locally.
Any exception requires explicit operator approval or the absence of a usable
worker/subagent delegation mechanism with all other safe progress blocked, plus
metadata-only evidence of the exception, reason, touched files or operations,
verification, and why waiting would block progress.

Keep the queue full from the authoritative PRD while implementation backlog remains. If safe backlog gets low, create the next story or planning artifact from approved PRD/BMAD sources instead of letting workers idle. When no PRD backlog remains, do not create post-slice work just to keep workers busy; proceed only to review fixes, required retrospectives, final audit, or a separately approved next source-owned PRD.

Split stories into parallel child lanes only when the split is technically safe, preserves BMAD acceptance criteria, reduces elapsed time, and has low merge conflict risk. Otherwise keep the story as one lane.

Prioritize backend truth first, then visible UX. Do not broaden the slice beyond the authoritative PRD. For /pipeline work, preserve the compact dashboard contract and put dense diagnostics behind details.

Use task-fit model selection: choose the best model expected to complete the work correctly with the least token waste. Do not downgrade quality just to save usage. At or below 2% Codex 5-hour remaining usage, enter manager-only mode, stop dispatching new worker work, and let safe active workers checkpoint or finish only when appropriate.

Report concise progress every few minutes with worker count, current story/epic, blockers needing operator action, usage/resource posture, and user-facing work ready to test. Do not ask for direction unless blocked, high-risk, or scope/authority expands.
```

## BMAD-Supported Course-Correction Loop

Use BMAD as the controlled planning and delivery loop around the authoritative
source bundle. BMAD artifacts guide discovery and execution, but they do not
invent product scope or replace source-owned requirements, architecture, policy,
tests, or delivery evidence.

For a course-correction cycle, follow this order:

1. **Discover:** use Analyst/PM review and bounded party-mode or subagent
   analysis to reconcile the PRD, architecture, epics, tracker, source state,
   delivery evidence, and technical debt. Retain only metadata findings and
   paths in local `_bmad-output/` review artifacts.
2. **Decide:** use `bmad-correct-course` to produce a scoped proposal when a
   requirement, architecture, authority, or acceptance boundary is wrong. Do
   not create a new epic merely because the backlog or worker queue is empty.
3. **Architect:** record runtime ownership, authority boundaries, evidence
   provenance, topology, rollback, and stop lines in a source-owned ADR or
   workflow contract before implementation scope is approved.
4. **Plan:** use `bmad-sprint-planning` to reconcile statuses, then
   `bmad-create-story` only for approved source-backed work with explicit
   acceptance criteria, verification, and completion boundaries.
5. **Implement:** use `bmad-dev-story` in a managed lane. Keep BMAD stories and
   reviews local; rewrite durable decisions into source-owned code, tests, docs,
   scripts, or policy.
6. **Review and verify:** delegate `bmad-code-review` and required fixes, then
   run focused and broader checks appropriate to the changed surface. Review is
   incomplete until findings are fixed, explicitly gated, or operator-deferred.
7. **Deliver:** use the governed workspace, PR, exact-head, merge, and cleanup
   workflow. Keep delivery and cleanup evidence metadata-only.
8. **Learn:** run `bmad-retrospective` at the end of each correction group or
   epic and carry only source-owned lessons into the next cycle.

For the current project correction, the first approved objective must be the
source hierarchy, terminal backlog behavior, server-bound authority, and one
honest integrated local operational loop. Epic 26 must remain blocked unless a
new source-owned product outcome explicitly authorizes it. Hold when source
authority, baseline ownership, evidence provenance, lifecycle ownership, or
production/live definitions are ambiguous.

## Standing Authority

Within the selected PRD scope, the manager may:

- Run manager preflight, resume, cycle, ledger repair, dispatcher, refill,
  warm-worker, handoff, progress, review, and safe cleanup dry-run scripts.
- Launch, monitor, answer, repair, retire, or restart manager-owned Codex
  workers only through existing manager gates.
- Create and update BMAD local planning/story/review/retro artifacts under
  `_bmad-output`.
- Dispatch implementation, code review, review-fix, and verification work to
  the owning worker or a bounded manager-owned worker/subagent through existing
  gates, then inspect compact evidence and record the returned result.
- Coordinate source-owned edits through the owning worker or delegated
  subagent; the manager session does not implement lane source changes.
- Create managed worktrees and branches for lanes.
- Request delegated workers/subagents to open/update PRs and perform low-risk
  delivery only when repo policy gates are satisfied; the manager inspects the
  exact-head evidence and enforces the gate without executing delivery locally.

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

## Standing Operator Delegation Profile

The operator may explicitly activate this profile for the current goal by
stating that manager planning, worker/subagent delegation, dispatch, recovery,
ownership handling, and standard delivery should proceed without repeated
per-operation prompts. When activated, the manager records the delegation in
the lane evidence and may continue these operations within the resolved PRD
source bundle:

- Reconcile and materialize local BMAD planning/story/review/retro state.
- Launch, restart, monitor, hand off, answer, and retire manager-owned Codex
  workers or bounded worker subagents through existing gates.
- Claim and dispatch source-owned lanes with `dispatch-next --apply` after a
  fresh exact-target dry run.
- Perform manager-owned recovery and ownership continuation, including a
  stale-owner takeover only when the exact target, preservation packet,
  ownership evidence, and workspace gates all pass.
- Dispatch workers/subagents to create worktrees/branches, implement, verify,
  review, deliver, merge, and clean up when all standard-delivery criteria are
  proven; the manager records compact evidence and does not execute those lane
  operations in its own session.

This profile never authorizes the manager session to implement source changes,
run lane verification or retest loops, conduct code review, fix review or CI
findings, commit, push, open or update a PR, merge, or clean up a lane. Those
operations remain delegated worker/subagent responsibilities, with only the
explicit no-delegation exception in the repository policy available after all
safe alternatives are exhausted.

This delegation is durable until the operator revokes it, the active PRD/source
bundle changes, or a non-delegable stop line is reached. It is not permission
to bypass a failed gate; a failed or ambiguous gate is held and reported while
unrelated safe work continues. The manager must still stop for secrets,
credentials, provider-account or payment changes, production deploys, schema
migrations, force-push/history rewrites, unknown/non-manager process
termination, raw prompt/provider/payload retention, failed required checks,
high-risk merge, destructive cleanup outside approved roots, or any system,
tenant, platform, or sandbox restriction. Those boundaries cannot be granted
by a repo document or chat delegation.

Evidence requirements remain metadata-only: authority basis, scope, exact
target, dry-run result, ownership/provenance, verification, recovery path, and
next action. No raw prompts, completions, reasoning traces, provider payloads,
secrets, or unnecessary source copies may be retained.

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
