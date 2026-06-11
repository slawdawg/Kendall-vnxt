# Story 6.5: Proposed Work Dev Console View

Date: 2026-06-10
Status: Review

## Story

As Bob,
I want a Proposed Work view in the Dev Console,
so that I can review Candidate Work from BMAD, Chief of Staff, Dev Console, or system sources before it becomes Active pipeline work.

## Context

Story 6.3 adds Candidate Work persistence/API. Story 6.4 adds BMAD import packages. This story gives Candidate Work a first visible Dev Console surface.

The Dev Console should be visual, dark-mode first, responsive, realtime-ready, and approachable for a non-developer operator. Use "Proposed Work" as the user-facing label instead of technical model language.

## Acceptance Criteria

1. Add a Dev Console Proposed Work route or section reachable from primary navigation.
2. Proposed Work displays Candidate Work cards or rows with:
   - title,
   - requested outcome,
   - source,
   - source artifact link/path,
   - risk,
   - priority,
   - status,
   - created/updated time.
3. Proposed Work uses non-developer language and visual status treatment.
4. Empty state explains that BMAD or Chief of Staff outputs can appear here as proposed work.
5. Candidate Work source labels include at least BMAD, Chief of Staff, Dev Console, and system.
6. Proposed Work is responsive on mobile and desktop.
7. Proposed Work does not trigger promotion, routing, execution, provider calls, command execution, Git operations, or GitHub remote operations in this story.
8. Dashboard/browser tests cover rendering, empty state, source/risk/status labels, and mobile layout.

## Authority

Allowed:

- dashboard UI route/section,
- read-only Candidate Work fetch,
- visual labels/status treatment,
- focused browser tests.

Blocked:

- Candidate approval/promotion actions,
- orchestrator routing,
- execution attempt creation,
- Codex/Claude/Ollama calls,
- command execution beyond tests,
- Git/GitHub operations.

## Implementation Notes

- Keep internal API/model names as Candidate Work, but user-facing copy should say Proposed Work.
- Prefer icons/status chips/lane/source badges where useful.
- Keep the view operationally dense but not jargon-heavy.
- Avoid full UI redesign beyond the Proposed Work surface.

## Verification

Required focused checks:

- dashboard build or focused type check,
- Proposed Work browser test,
- mobile/responsive browser test if layout changes are material.

Run full `pnpm.cmd run check` if shared contracts or cross-package behavior are touched.
