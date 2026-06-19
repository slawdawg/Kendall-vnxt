---
date: 2026-06-19
status: story proposal research
topic: read-only worktree visibility foundation
input_documents:
  - docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
  - docs/research/developer-readiness-dashboard-research-packet-2026-06-19.md
  - docs/workflows/workspace-coordination-report.md
  - scripts/codex-workspace.mjs
---

# Read-Only Worktree Visibility Foundation Proposal

## Status

This is a story proposal, not a ready-for-dev BMAD story. This lane does not
currently have `_bmad-output/implementation-artifacts/sprint-status.yaml`, so no
formal sprint backlog item was promoted by the BMAD create-story workflow.

Use this packet as the source material for sprint planning or a future story
creation pass.

## Why This Exists

The Developer Readiness Dashboard is the top product candidate from the
non-orchestrator backlog, but it should not be implemented before the read-only
worktree visibility foundation exists.

The foundation should answer:

```text
What managed worktrees exist, what state are they in, and what read-only
evidence supports the next operator decision?
```

It should not execute work, mutate Git, merge PRs, clean up worktrees, call
providers, launch workers, access credentials, or become a second orchestration
state machine.

## Proposed Story

As Bob,
I want a read-only projection of managed Codex worktrees and current checkout
state,
so that I can tell which lane is safe to inspect, continue, or promote without
running mutating workspace commands.

## Scope

Create a read-only visibility foundation over existing sources:

- `node ./scripts/codex-workspace.mjs list`;
- `git status --short --branch`;
- `git worktree list --porcelain`;
- current checkout path and branch;
- known PR URL/status strings already exposed by workspace manifests;
- stop-line classifications from `docs/workflows/workspace-coordination-report.md`.

The output can initially be a CLI/report model. A Dev Console view and
Developer Readiness Dashboard should come later.

## Acceptance Criteria

1. Given a worktree with managed workspace state,
   when the read-only visibility command/report runs,
   then it lists known managed workspaces with task id, state, branch, PR marker,
   and worktree path without mutating local files or Git state.

2. Given the current checkout,
   when the read-only visibility command/report runs,
   then it reports the current branch, upstream/ahead/behind marker when
   available, and clean/dirty/untracked status using Git as the source.

3. Given local-only commits or dirty files,
   when the report classifies the lane,
   then it marks the lane as requiring preservation or explicit scope before
   push, cleanup, merge, discard, or overlapping work.

4. Given closed, active, dirty, local-only, and cleanup-candidate lanes,
   when the report classifies them,
   then it uses the vocabulary from `docs/workflows/workspace-coordination-report.md`
   and does not introduce a parallel lifecycle model.

5. Given a cleanup, merge, provider, worker, credential, branch deletion, or
   worktree deletion opportunity,
   when the report recommends a next step,
   then it stops at read-only guidance and names the required approval boundary
   instead of executing or implying approval.

6. Given network or GitHub metadata is unavailable,
   when the report runs,
   then it still produces local Git/workspace visibility and marks remote PR/CI
   details as unavailable rather than failing the whole report.

## Non-Goals

- No dashboard implementation.
- No Dev Console UI.
- No new work selection, approval, execution, or recovery lifecycle.
- No automatic next-action execution.
- No Git mutation, branch deletion, worktree deletion, cleanup apply, PR merge,
  push, or PR creation.
- No provider/API calls, paid usage, worker launch, Graphify, credential access,
  session access, or scheduler/service mutation.
- No replacement for `scripts/codex-workspace.mjs`.

## Suggested Implementation Shape

1. Add a read-only status/projection helper that shells out to existing Git and
   workspace inventory commands or reuses existing parsing helpers if present.
2. Keep the projection data model small:
   - current checkout;
   - managed workspace rows;
   - local branch cleanliness;
   - preservation/stop-line flags;
   - unavailable remote metadata markers.
3. Add a CLI/report command before any UI surface.
4. Add tests around classification, unavailable metadata, dirty/local-only
   states, and stop-line wording.
5. Use the report as input for a later Developer Readiness Dashboard mini-PRD.

## Verification Expectations

Minimum focused checks for implementation:

```text
node --version
pnpm --version
node ./scripts/codex-workspace.mjs list
git status --short --branch
pnpm run check:workspace-coordination
pnpm run check:mise-workflow
```

Broaden to `pnpm run check` if implementation touches shared scripts,
dashboard code, supervisor code, contracts, workflow-core, authority policy, or
evidence behavior.

## Open Questions For Promotion

1. Should this become a new `codex-workspace.mjs status` command, a separate
   script, or an internal helper plus existing command output?
2. Should PR/CI metadata be read through GitHub only when explicitly requested,
   or should the first foundation stay local-only?
3. Should the report be saved as evidence, printed only, or both?
4. Which future artifact owns dashboard requirements after this foundation:
   mini-PRD, story, or product brief?

## Recommended Next Step

Promote this proposal into the sprint backlog as a narrow story before writing
dashboard code. The story should target read-only visibility only and preserve
the stop lines above.
