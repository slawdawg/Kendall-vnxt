---
date: 2026-06-19
status: research packet
topic: developer readiness dashboard
input_documents:
  - docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
  - docs/research/non-orchestrator-backlog-decision-matrix-2026-06-19.md
  - docs/workflows/workspace-coordination-report.md
  - docs/research/standard-worktree-workflow-tooling-recommendation-2026-06-18.md
---

# Developer Readiness Dashboard Research Packet

## Executive Summary

The Developer Readiness Dashboard should give Bob one operator-facing view for
answering four questions:

1. Where am I working?
2. Is this lane locally ready?
3. What remote or CI state matters?
4. What is the next safe action?

The dashboard should not become a second orchestration model. It should surface
existing evidence from Git, managed worktree manifests, `mise` readiness tasks,
PR/CI status, and explicit stop lines. Its value is synthesis: reduce command
memory and context switching while preserving the current governance model.

Recommended next artifact: read-only worktree visibility foundation. Promote the
dashboard to a mini-PRD only after that foundation is shaped, and treat the
mini-PRD as planning input rather than implementation approval.

## Problem

Bob's current workflow has several useful but separate signals:

- current branch and dirty state;
- managed worktree inventory;
- local-only commits;
- behind/ahead state;
- `mise` readiness and check tasks;
- PR state and CI checks;
- handoffs, evidence files, and approval packets;
- stop lines for merge, cleanup, branch deletion, provider calls, worker launch,
  secrets, retention, and execution authority.

Each signal exists, but the operator has to remember which command or document
answers which question. That creates friction during task handoff, mobile/SSH
continuation, and multi-lane work.

## Product Hypothesis

If Kendall_Nxt provides a concise Developer Readiness Dashboard, Bob can resume
or steer work faster without weakening governance. The dashboard should reduce
unknowns at the start of a session and make the next safe action explicit.

Success means Bob can answer this in under a minute:

```text
What lane is this, is it ready, what changed, and what should happen next?
```

## Audience

Primary audience: Bob operating Kendall_Nxt development from local, SSH, mobile,
or tmux-backed Codex sessions.

Secondary audience: future agent sessions that need a narrow first-read target
before expanding into story, PRD, architecture, or implementation context.

## Minimum Useful View

The first version should be a dense operator dashboard, not a marketing page or
large narrative report.

Required sections:

| Section | Purpose |
| --- | --- |
| Current lane | Worktree path, branch, base/upstream, ahead/behind, current commit. |
| Local readiness | Clean/dirty state, untracked files, local-only commits, `mise` setup/preflight/check status when available. |
| Workspace inventory | Active managed worktrees, dirty lanes, merge-gated lanes, local-only lanes, cleanup candidates. |
| PR/CI state | Open PR for this lane if present, review state, CI state, failing check summary. |
| Evidence and handoff | Latest handoff, relevant evidence packet, last verification command, known blocker. |
| Next safe action | One recommended action plus reason and stop lines. |

## Next Safe Action Model

The dashboard should recommend exactly one primary next action when possible.

Examples:

| Observed State | Next Safe Action |
| --- | --- |
| Dirty files in current lane | Review and commit/stash/discard only with explicit scope. |
| Local-only commits, no PR | Decide whether to keep local, open PR, or continue research. |
| Branch behind base, clean | Refresh from base before new work. |
| PR open, CI failing | Inspect failing checks before code changes. |
| PR green, merge approval missing | Ask Bob for merge approval; do not merge automatically. |
| Cleanup candidate | Run cleanup dry-run; require approval before apply. |
| Provider/worker/credential action needed | Stop for explicit authority packet. |

The recommendation should include a short reason and the evidence source, such
as Git status, workspace list output, PR check result, or a handoff file.

## Data Sources

Prefer existing sources before adding custom state:

- `git status --short --branch`;
- `git log --oneline -n <count>`;
- `git worktree list --porcelain`;
- `node ./scripts/codex-workspace.mjs list`;
- `node ./scripts/codex-workspace.mjs doctor`;
- `mise run workspace-doctor`;
- `mise run preflight`;
- `mise run check`;
- GitHub PR and check metadata when available and approved;
- local docs under `docs/handoffs`, `docs/workflows`, `docs/research`, and
  story/evidence files when directly linked.

Do not create a parallel lifecycle store unless a concrete gap is proven. The
dashboard should summarize existing authority and evidence, not own it.

## Boundary And Stop Lines

This research packet does not approve implementation.

Do not include these in the first dashboard scope:

- provider/API calls;
- paid usage;
- worker launch;
- Graphify commands;
- credential or session access;
- branch deletion;
- worktree deletion;
- PR merge;
- automatic cleanup;
- automatic issue or review-thread mutation;
- source or evidence retention policy changes.

Do not implement dashboard product expansion inside the orchestrated worktree
visibility branch unless Bob explicitly broadens that lane. Treat read-only
worktree visibility as an upstream dependency.

## UX Notes

The dashboard should feel like an operations console:

- compact, scan-friendly, and state-first;
- quiet visual hierarchy;
- no oversized hero section;
- no explanatory in-app prose for obvious controls;
- stable dimensions for status tiles, check rows, and action controls;
- clear stop-line presentation for dangerous or approval-gated operations.

If built into an existing dashboard, use current design conventions and avoid
creating a competing navigation model.

## Open Questions

1. Should the first deliverable be a CLI/status report, a Dev Console view, or
   both from a shared read model?
2. Should GitHub PR/CI data be optional so the dashboard works offline or before
   credentials are configured?
3. What is the minimum acceptable freshness for readiness checks: cached last
   run, on-demand command execution, or both?
4. Should local-only commits be shown as warnings, neutral state, or action
   prompts?
5. Should handoff detection prefer `docs/handoffs/current.md`, latest dated
   handoff, or explicit lane metadata?

## Recommended Implementation Shape

After a mini-PRD, implementation should likely proceed in layers:

1. Read-only status model that collects Git/workspace/readiness state.
2. CLI report using the same model.
3. Dev Console view using the same model.
4. PR/CI integration behind explicit availability and authority checks.
5. Action affordances that only preview commands at first.

Mutating actions should remain human-approved and evidence-producing. The
dashboard can recommend, preview, and link; it should not silently execute
cleanup, merge, provider, credential, or worker actions.

## Acceptance Sketch

A useful first product slice should:

- identify the current lane and branch state;
- show clean/dirty and ahead/behind state;
- list active managed worktrees;
- identify local-only commits;
- link the latest relevant handoff or evidence file when available;
- show local readiness status or say when it has not been run;
- recommend one next safe action;
- show stop lines for gated operations;
- work without network access;
- avoid mutating Git, GitHub, source files, credentials, workers, or providers.

## Recommended Next Step

Shape the read-only worktree visibility foundation first. After that foundation
exists, create a mini-PRD for the Developer Readiness Dashboard. Until then,
keep this packet as research input and avoid adding dashboard scope to the
orchestrator branch.
