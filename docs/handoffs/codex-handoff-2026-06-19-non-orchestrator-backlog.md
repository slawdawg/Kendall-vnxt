# Codex Handoff: Non-Orchestrator Backlog From Research Brainstorming

Date: 2026-06-19
Status: handoff for the research/brainstorming lane
Worktree: `/home/slaw_dawg/.codex-workspaces/slawdawg-kendall-vnxt/worktrees/research-brainstorming`
Branch: `research/brainstorming`

## Current Pause Point

Updated: 2026-06-19T01:16:50Z

Bob is moving this lane into a tmux-backed SSH session. The current Codex
process was started from the correct worktree path but is not inside tmux:

```text
TMUX=
SSH_TTY=/dev/pts/0
PWD=/home/slaw_dawg/.codex-workspaces/slawdawg-kendall-vnxt/worktrees/research-brainstorming
```

User-level shell behavior was updated outside the repo in `/home/slaw_dawg/.bashrc`:

- interactive SSH logins auto-start tmux
- default tmux behavior resumes or creates a worktree-named session
- `tmux-new-lane` creates a unique worktree-named tmux session when needed
- this is Bob's personal shell preference, not a Kendall_Nxt product feature,
  and should remain out of the repo

Current repo state at pause:

```text
## research/brainstorming...origin/main [behind 4]
?? docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
```

Next session should resume from this worktree in tmux, then refresh the
worktree from `origin/main` before continuing backlog research.

## Research Slice Update

Updated: 2026-06-19T02:04:48Z follow-up local research slice.

### Start Here

Read this section before opening the individual research packets. The slice is
advisory research, not execution authority or implementation approval.

| Read Order | Artifact | Decision It Supports |
| --- | --- | --- |
| 1 | `docs/research/non-orchestrator-backlog-decision-matrix-2026-06-19.md` | Which backlog items should be promoted first. |
| 2 | `docs/research/developer-readiness-dashboard-research-packet-2026-06-19.md` | Whether the dashboard is the top product candidate and what must exist first. |
| 3 | `docs/research/read-only-worktree-visibility-foundation-proposal-2026-06-19.md` | How to promote the dashboard blocker into a narrow read-only foundation story. |
| 4 | `docs/research/bmad-workflow-compression-decision-packet-2026-06-19.md` | How to think about ceremony reduction without making a governance change yet. |
| 5 | `docs/research/ci-supervisor-profiling-spike-packet-2026-06-19.md` | How to measure CI/supervisor runtime before proposing changes. |

Top candidate: Developer Readiness Dashboard.

Current blocker: read-only worktree visibility foundation must be shaped before
dashboard implementation or mini-PRD promotion.

This lane now has local-only research commits for the non-orchestrator backlog
slice:

- `docs/research/non-orchestrator-backlog-decision-matrix-2026-06-19.md`
- `docs/research/developer-readiness-dashboard-research-packet-2026-06-19.md`
- `docs/research/read-only-worktree-visibility-foundation-proposal-2026-06-19.md`
- `docs/research/bmad-workflow-compression-decision-packet-2026-06-19.md`
- `docs/research/ci-supervisor-profiling-spike-packet-2026-06-19.md`

Current slice recommendation:

1. Keep Developer Readiness Dashboard as the top product candidate, blocked on
   read-only worktree visibility foundation.
2. Promote `docs/research/read-only-worktree-visibility-foundation-proposal-2026-06-19.md`
   into a narrow story before dashboard code.
3. Promote the dashboard to a mini-PRD only after the read-only worktree visibility
   foundation is available.
4. Treat BMAD Workflow Compression as an experimental threshold proposal, not
   operating policy, until Bob approves a governance update.
5. Treat CI Speed And Signal / Supervisor Test Performance as a profiling spike
   that should measure first and restructure only after evidence exists.

Do not push, open a PR, merge, clean up worktrees, restructure CI, change BMAD
governance, or add dashboard implementation scope without explicit approval.

## Purpose

This handoff preserves useful non-orchestrator threads from the
research/brainstorming discussion. These items belong to the
research/brainstorming lane, not the new orchestrator implementation worktree.

The separate orchestrator worktree is:

```text
/home/slaw_dawg/.codex-workspaces/slawdawg-kendall-vnxt/worktrees/20260619-orchestrated-worktree-visibility
```

Use that worktree only for orchestrated worktree visibility / parallel lane
status work unless Bob redirects scope.

## Completed Context

- `mise` is implemented as the normal supported local readiness workflow.
- PR #148, `Implement mise normal workflow`, merged to `main` as
  `43a937e4a970516cfc461d97c6ff646ae696db69`.
- The merged workflow adds tracked `mise.toml`, `check:mise-workflow`, Story
  22.3, and implementation evidence.
- Post-merge validation passed:
  - `mise run setup`
  - `mise run workspace-doctor`
  - `mise run preflight`
  - `mise run check`, including dashboard build and supervisor suite
- A local personal Codex skill was created outside the repo:
  `/home/slaw_dawg/.codex/skills/kendall-workspace/SKILL.md`
- That skill tells future Codex sessions how to create/resume/finish Kendall_Nxt
  workspaces using `scripts/codex-workspace.mjs` plus `mise` readiness.

## Non-Orchestrator Backlog

These ideas were discussed as high-value project improvements. They should be
handled in this research/planning lane or in future dedicated lanes, not inside
the orchestrator branch unless Bob explicitly broadens that scope.

1. Workspace UX Polish
   - Goal: make workspace creation/resume/finish nearly commandless for Bob.
   - Current state: local `kendall-workspace` skill exists outside the repo.
   - Possible next step: decide whether repo docs or command wrappers should
     make this durable for all sessions, not only this local Codex home.

2. CI Speed And Signal
   - Goal: reduce CI wait time while preserving confidence.
   - Prior observation: supervisor CI can take around 2-3 minutes on GitHub.
   - Possible next step: profile supervisor tests and split fast/slow or
     path-scoped checks more intentionally.

3. Developer Readiness Dashboard
   - Goal: show local readiness, worktree state, PR/CI state, and next safe
     action in one place.
   - Boundary: overlaps conceptually with orchestrated worktree visibility, but
     dashboard/product expansion should remain a separate lane until the
     read-only worktree visibility foundation exists.

4. BMAD Workflow Compression
   - Goal: keep BMAD rigor while reducing ceremony for small changes.
   - Possible next step: define thresholds for when a change needs a PRD, epic,
     story, evidence packet, party mode, or only a focused check.

5. Codex Skills Library
   - Goal: make common project workflows available as personal or repo-supported
     skills.
   - Candidate skills:
     - `kendall-workspace`
     - `kendall-pr-delivery`
     - `kendall-review-fix`
     - `kendall-bmad-story`
     - `kendall-ci-triage`
   - Boundary: skills can reduce friction without product code, but repo-owned
     skill distribution needs a separate decision.

6. PR Policy And Lane Governance
   - Goal: clarify when work should become a PR, when local work is acceptable,
     when to squash, and when cleanup is allowed.
   - Existing references:
     - `docs/workflows/workspace-coordination-report.md`
     - delivery readiness and cleanup policy reports

7. Local Dev One-Command Experience
   - Goal: make fresh clone/worktree startup boring.
   - Current state: `mise run setup`, `mise run preflight`, and
     `mise run check` are now supported.
   - Possible next step: decide whether Bob should use only `mise` tasks or
     whether a higher-level command should wrap workspace creation plus
     readiness.

8. Runtime Evidence Quality
   - Goal: improve how evidence is generated, checked, summarized, and linked
     to stories/PRs.
   - Boundary: this is product/governance work and likely deserves its own BMAD
     story or PRD depending on scope.

9. Supervisor Test Performance
   - Goal: profile and reduce runtime for the 205-test supervisor suite.
   - Possible next step: use `pnpm run test:supervisor:profile`, inspect slow
     tests, and decide whether fixture reuse or narrower integration coverage
     can reduce CI time.

10. Next Product Value Lane
   - Goal: shift from workflow/tooling to a product feature that makes
     Kendall_Nxt more useful as an orchestrator.
   - Candidate areas: work visibility, approval gates, candidate/active work,
     execution readiness, and Dev Console decision support.

## Suggested Workflow For This Backlog

Use one portfolio research lane before implementation:

1. Create or resume a dedicated planning workspace.
2. Produce short research packets for the ten backlog ideas.
3. Run party-mode review across architecture, developer workflow, QA/governance,
   operator UX, and product value.
4. Create a decision matrix ranking value, risk, effort, dependencies, and PRD
   need.
5. Promote only the top items into PRD/epic/story work.

Do not turn all ten ideas into implementation stories at once.

## PRD / Epic Guidance

Use a PRD when the idea changes product behavior, crosses backend/frontend/docs
boundaries, changes approval/governance policy, or affects user-facing Dev
Console workflows.

Likely PRD or mini-PRD candidates:

- Developer Readiness Dashboard
- Runtime Evidence Quality
- Next Product Value Lane
- BMAD Workflow Compression if it changes governance rules
- PR Policy And Lane Governance if it changes formal workflow

Likely story-only candidates:

- CI Speed And Signal
- Supervisor Test Performance
- Workspace UX Polish
- Codex Skills Library
- Local Dev One-Command Experience, unless it becomes installer/bootstrap work

## Explicit Non-Goals For The Orchestrator Worktree

Do not implement these backlog items in
`codex/orchestrated-worktree-visibility` unless Bob explicitly redirects scope:

- broad CI restructuring
- supervisor test suite optimization
- repo-distributed Codex skill system
- BMAD governance overhaul
- runtime evidence redesign
- product feature implementation unrelated to worktree visibility
- Linux install lane work
- provider calls, paid calls, worker launches, Graphify commands, credential or
  session access

## Suggested Resume Prompt

```text
Read docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md.
Use it as the research/brainstorming handoff for non-orchestrator backlog
threads. Do not mix these backlog items into the orchestrated worktree
visibility branch unless Bob explicitly approves that scope change.
```
