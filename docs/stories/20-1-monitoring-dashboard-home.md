---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 20.1: Monitoring Dashboard Home

Status: review

## Story

As Bob,
I want the dashboard home to default to a monitoring-first Mission Control view,
so that I can see active work, attention needs, failed or stale states, recent evidence, and safe drill-in paths without starting from command or mutation controls.

## Acceptance Criteria

1. Given Bob opens the dashboard home, when the page renders, then the first viewport prioritizes a monitoring status bar, attention queue, live activity, and read-only evidence or drill-in context instead of create/control surfaces.
2. Given active, blocked, failed, or attention-needed work exists, when the home view renders, then each item shows operator-readable state, owner or agent where available, lane/workflow group, latest event or status summary, age/timestamp, next safe action, and a link to detail.
3. Given an item requires approval, retry, cleanup, merge, provider execution, process launch, source mutation, or other authority-gated action, when it appears on the home view, then the compact home item offers inspection or detail navigation only and does not expose the mutating action directly.
4. Given existing dashboard pages and detail surfaces exist, when Story 20.1 is implemented, then Proposed Work, Queue, Active Work, Attention, Audit, Controls, work-item detail pages, existing evidence panels, and report panels remain reachable and keep their existing behavior unless explicitly adjusted for the monitoring home composition.
5. Given the monitoring UX draft exists, when the dashboard is built, then the home screen follows the draft direction: calm operational density, compact typography, minimal decoration, no marketing hero, no nested card-heavy layout, and no decorative gradients/orbs as the primary authenticated dashboard treatment.
6. Given dashboard regression checks run, when the implementation is complete, then focused dashboard build and relevant e2e/report checks prove the monitoring home renders, labels authority-gated work as inspect/detail-first, and preserves read-only evidence visibility.

## Tasks / Subtasks

- [x] Recompose the dashboard home around monitoring. (AC: 1, 2, 5)
  - [x] Update `apps/dashboard/src/app/page.tsx` to make Monitoring/Mission Control the default home surface.
  - [x] Move create/control affordances out of the first viewport; keep them reachable through existing pages or secondary sections.
  - [x] Surface status metrics in a compact operational status bar: active, blocked/failed, attention, queued, and last available verification or health summary if existing data supports it.
  - [x] Use existing supervisor data from `getRunStatus()`, `getWorkItems()`, and existing display helpers before adding new API contracts.
- [x] Add or reuse monitoring components. (AC: 1-4)
  - [x] Prefer extending/reusing `AttentionBrowser`, `LiveFeed`, `WorkGrid`, `EvidenceOverviewPanel`, `ActiveWorkBrowser`, or small shared presentation helpers instead of creating duplicate concepts.
  - [x] If a compact home-only attention summary is needed, keep it read-only and link to `/attention` and `/work-items/[work-item-id]`.
  - [x] If a home evidence inspector is introduced, make it a read-only summary/shortcut surface; do not duplicate full work-item detail behavior.
- [x] Preserve authority boundaries. (AC: 3, 4)
  - [x] Do not add home-screen buttons for approve, retry, cleanup, merge, provider execution, process launch, source mutation, issue sync, credential access, or failed-check bypass.
  - [x] Home-screen language must distinguish `approval required`, `blocked`, `failed`, `running`, `done`, and `inspect` from `approved` or `executable`.
  - [x] Keep mutating controls in existing deliberate detail/control flows only where already supported.
- [x] Align visual treatment with the monitoring UX draft. (AC: 5)
  - [x] Reduce hero-like framing on the authenticated home page.
  - [x] Replace decorative gradient/orb treatment for the primary monitoring surface with restrained operational layout, borders, stable rows, and compact panel headings.
  - [x] Avoid nested cards; use rows/tables for repeated monitoring items where comparison matters.
  - [x] Keep responsive behavior: desktop first, tablet collapsible, mobile read-only triage stack.
- [x] Add or update regression coverage. (AC: 1-6)
  - [x] Update dashboard e2e assertions for the home page's monitoring-first labels and absence of direct authority-gated action buttons.
  - [x] Update any report/drift check that asserts old home copy such as "Workflow command surface" or the decorative command-surface framing.
  - [x] Add assertions that attention items link to detail and preserve inspect/detail-first language.
- [x] Update documentation and story evidence. (AC: 1-6)
  - [x] Update `docs/stories/index.md` if story status changes during implementation.
  - [x] Record verification commands, completion notes, changed files, and review findings in this story.

## Dev Notes

### Source Context

- Bob selected a primarily monitoring-oriented dashboard direction on 2026-06-14.
- UX draft artifacts:
  - `_bmad-output/planning-artifacts/ux-designs/ux-Kendall_Nxt-2026-06-14/DESIGN.md`
  - `_bmad-output/planning-artifacts/ux-designs/ux-Kendall_Nxt-2026-06-14/EXPERIENCE.md`
  - `_bmad-output/planning-artifacts/ux-designs/ux-Kendall_Nxt-2026-06-14/.decision-log.md`
- The selected UX pattern is Mission Control home + Workbench detail screens + Evidence inspector.
- Primary mode is monitoring. Mutating actions belong in deliberate detail/control flows with authority context visible.

### Existing Implementation To Reuse

- Dashboard home and shell:
  - `apps/dashboard/src/app/page.tsx`
  - `apps/dashboard/src/components/shell.tsx`
  - `apps/dashboard/src/components/page-intro.tsx`
  - `apps/dashboard/src/components/realtime-refresh.tsx`
- Existing monitoring or list components:
  - `apps/dashboard/src/components/attention-browser.tsx`
  - `apps/dashboard/src/components/attention-badge.tsx`
  - `apps/dashboard/src/components/live-feed.tsx`
  - `apps/dashboard/src/components/work-grid.tsx`
  - `apps/dashboard/src/components/active-work-browser.tsx`
  - `apps/dashboard/src/components/queue-browser.tsx`
  - `apps/dashboard/src/components/url-synced-work-item-browser.tsx`
- Existing evidence/detail components:
  - `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
  - `apps/dashboard/src/components/evidence-overview-panel.tsx`
  - `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`
  - `apps/dashboard/src/components/runtime-evidence-export-panel.tsx`
  - `apps/dashboard/src/components/work-item-history.tsx`
  - `apps/dashboard/src/components/work-item-retry-history.tsx`
- Data and display helpers:
  - `apps/dashboard/src/lib/supervisor.ts`
  - `apps/dashboard/src/lib/nav-stats.ts`
  - `apps/dashboard/src/lib/workflow-display.ts`
  - `apps/dashboard/src/lib/work-item-filtering.ts`
- Existing tests and checks likely to touch:
  - `tests/e2e/dashboard.spec.ts`
  - `scripts/check-dashboard-e2e-report.mjs`
  - `scripts/check-supervisor-report-catalog.mjs`

### Current Behavior To Change Carefully

- `apps/dashboard/src/app/page.tsx` currently opens with `PageIntro` titled "Workflow command surface", renders `CreateWorkItemForm` near the top, shows a "Mode snapshot", `LiveFeed`, `ControlPanel`, and `WorkGrid`.
- `apps/dashboard/src/components/shell.tsx` currently uses a large branded header and decorative radial/linear background treatment. If changed, preserve navigation links and `navStats` badges.
- Existing pages `/proposed-work`, `/queue`, `/active-work`, `/audit`, `/attention`, `/controls`, and `/work-items/[work-item-id]` are part of the current operator workflow. Do not remove or break them.
- `EvidenceOverviewPanel` already states "Read-only shortcuts" and "No execution controls"; reuse that posture for home evidence summaries if an inspector/shortcut panel is added.

### Architecture And Safety Boundaries

- This story changes dashboard presentation and regression coverage. It must not execute provider calls, launch subscription-agent processes, perform premium execution, compute adaptive scores, mutate GitHub, merge PRs, delete worktrees, delete branches, sync issues, access credentials, mutate source by workers, bypass failed checks, or grant broad autonomy.
- Do not introduce new backend mutation endpoints for this story.
- Do not retain or display raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, or unbounded command output.
- Preserve metadata-only evidence boundaries and existing report/evidence shortcut patterns.
- Use the dashboard package's pinned stack: Next `16.2.7`, React `19.2.4`, Tailwind CSS `4`, and existing workspace packages from `apps/dashboard/package.json`.

### UX Implementation Guidance

- First viewport priority: status bar, attention queue, live activity, evidence/drill-in context.
- Default actions on home: inspect, filter, acknowledge if already existing, open detail.
- Authority-gated actions on home: link to detail only.
- Copy should be operational: "Approval required", "Blocked", "Failed verification", "Inspect evidence", "Open detail", "No attention needed".
- Avoid marketing language, celebration, motivational copy, or vague "everything is good" claims without timestamp/evidence.
- Use stable dimensions for repeated rows and badges so live updates do not shift the layout unnecessarily.
- For mobile, stack status, attention, active work, and recent evidence; avoid complex recovery controls.

### Testing

Minimum focused verification:

- `pnpm.cmd --filter @kendall/dashboard build`

Run targeted checks depending on touched surfaces:

- `pnpm.cmd run check:e2e-report`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:docs`

If home e2e assertions are updated or added:

- `pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts`

Broaden before PR:

- `pnpm.cmd run check`

On this Windows workspace, run commands one at a time. If supervisor Python tests become necessary, prefer `pnpm.cmd run test:supervisor` or disable pytest cache explicitly.

## References

- `_bmad-output/planning-artifacts/ux-designs/ux-Kendall_Nxt-2026-06-14/DESIGN.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-Kendall_Nxt-2026-06-14/EXPERIENCE.md`
- `apps/dashboard/src/app/page.tsx`
- `apps/dashboard/src/components/shell.tsx`
- `apps/dashboard/src/components/attention-browser.tsx`
- `apps/dashboard/src/components/live-feed.tsx`
- `apps/dashboard/src/components/evidence-overview-panel.tsx`
- `apps/dashboard/package.json`
- `docs/stories/index.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` after Bob approved a monitoring-first dashboard direction.
- Red-phase focused e2e failed before implementation: `pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "opens to a monitoring-first home"`.
- Focused monitoring home e2e passed: `pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "opens to a monitoring-first home"`.
- Affected intake/action e2e group passed: `pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "shows supervisor-owned recipe details during intake|guides a non-coder|advances a work item"`.
- Dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Dashboard e2e report drift check passed: `pnpm.cmd run check:e2e-report`.
- Documentation verification passed: `pnpm.cmd run check:docs`.
- Full local gate passed: `pnpm.cmd run check`, including static checks, dashboard build, and 197 supervisor tests with one existing aiosqlite deprecation warning.
- Post-review focused e2e passed: `pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "opens to a monitoring-first home|shows supervisor-owned recipe details during intake|guides a non-coder|advances a work item"`.
- Post-review dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Post-review full local gate passed: `pnpm.cmd run check`, including static checks, dashboard build, and 197 supervisor tests with one existing aiosqlite deprecation warning.

### Completion Notes List

- Replaced the home page's command-surface composition with a monitoring-first Mission Control view.
- Added a read-only monitoring home component showing compact status metrics, attention queue, active work, evidence shortcuts, and inspect/detail links.
- Moved intake work creation to the Controls page and kept workflow action buttons on the Queue page rather than the home page.
- Reduced shell-level decorative treatment by replacing radial/linear background treatment and large hero header with restrained operational framing.
- Updated live feed label to "Live activity" to match the monitoring language.
- Added a short live-refresh pause while the intake form is being used so operator input is not overwritten by EventSource refresh.
- Updated e2e coverage for monitoring-first home behavior, no direct authority-gated home controls, moved intake, and moved action-board coverage.
- Patched BMAD code-review findings by using the total attention count rather than the five-row display limit, guarding localStorage access around refresh pause, and restoring a compact shell `h1`.

### Review Findings

- BMAD code review found and fixed an attention-count bug where the home status bar displayed only the capped row count.
- BMAD code review found and fixed localStorage robustness risk in the live-refresh pause path.
- BMAD code review found and fixed a semantic heading regression caused by removing the shell `h1`.

### File List

- `apps/dashboard/src/app/controls/page.tsx`
- `apps/dashboard/src/app/page.tsx`
- `apps/dashboard/src/components/create-work-item-form.tsx`
- `apps/dashboard/src/components/live-feed.tsx`
- `apps/dashboard/src/components/monitoring-home.tsx`
- `apps/dashboard/src/components/realtime-refresh.tsx`
- `apps/dashboard/src/components/shell.tsx`
- `docs/stories/20-1-monitoring-dashboard-home.md`
- `docs/stories/index.md`
- `tests/e2e/dashboard.spec.ts`

## Change Log

- 2026-06-14: Created Story 20.1 and moved it to ready-for-dev.
- 2026-06-14: Implemented monitoring-first dashboard home, moved intake/actions to deliberate surfaces, verified focused e2e, dashboard build, docs, and full local gate, and moved Story 20.1 to review.
- 2026-06-14: Addressed BMAD code-review findings and re-ran focused e2e, dashboard build, and full local gate.
