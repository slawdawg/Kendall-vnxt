---
baseline_commit: 4661a21d71c48452a8b4143d9c78761a1c56cd37
---

# Story 21.1: Token Economy Foundation

Status: done

## Story

As Bob,
I want Kendall_Nxt agents and workflows to use tokens more economically while staying visible and understandable,
so that routine development work feels quieter, less wasteful, and less churn-prone without hiding safety gates, decisions, or progress.

## Acceptance Criteria

1. Given an agent is doing routine work, when it sends progress updates, then updates are short, avoid repeated background, and report only the current phase, meaningful deltas, blockers, or upcoming decisions.
2. Given an important state change occurs, when the agent explains it, then the explanation uses plain English for a non-developer and covers what changed, why it matters, and what happens next.
3. Given token economy guidance is added, when safety, approval, uncertainty, failed checks, source/evidence boundaries, destructive actions, provider calls, worker launch, GitHub delivery, cleanup, or Bob steering is involved, then the guidance explicitly forbids compressing away that information.
4. Given command/tool churn appears, when the same command/tool path fails twice or a known-bad pattern appears, then the guidance routes the agent to a Tool Churn RCA workflow instead of blind retries.
5. Given Tool Churn RCA is triggered, when the RCA packet is produced, then it includes what failed, failure class, likely cause, evidence, retry stop line, one next safe action, and one durable fix recommendation.
6. Given an agent needs project context, when the task type is known, then a context entry map points it to the smallest relevant first-read files and names when to expand context.
7. Given external token-reduction tools are considered, when this story completes, then ccusage, Headroom, Defluffer-style cleanup, provider prompt caching, and Redis LangCache remain evaluation candidates only unless later evidence and approval adopt them.
8. Given this story is docs/workflow only, when it completes, then no live provider calls, paid tool use, process launch, worker launch, destructive cleanup, GitHub mutation, credential/session access, compression-layer adoption, or broad automation is introduced.
9. Given documentation changes are complete, when verification runs, then the smallest relevant documentation check passes or any inability to run it is recorded with the reason.

## Tasks / Subtasks

- [x] Update agent behavior guidance for token economy. (AC: 1, 2, 3)
  - [x] Add quiet competent operator default for routine work.
  - [x] Add plain-English escalation rules for important changes.
  - [x] Add visible-progress-with-low-noise expectations.
  - [x] Add non-negotiables that token economy must not hide.
- [x] Add Tool Churn RCA workflow/spec. (AC: 4, 5)
  - [x] Define trigger conditions, including repeated failures and known-bad command/tool patterns.
  - [x] Define failure classes: quoting, PATH/tool resolution, sandbox, permission, dependency, flaky test/check, stale state, and unknown.
  - [x] Define the minimal RCA packet format.
  - [x] Define durable fix paths: AGENTS.md update, wrapper script, preflight/doctor hardening, memory note request, story/refactor task, or explicit approval packet.
- [x] Add AI context entry map. (AC: 6)
  - [x] Map common task types to minimal first-read files.
  - [x] Define expansion rules and stop rules.
  - [x] Prefer links, summaries, and exact source pointers over copying large artifacts into chat.
- [x] Add measurement and tool-evaluation plan. (AC: 7)
  - [x] Define how to evaluate ccusage for Codex/Claude local usage visibility.
  - [x] Define Headroom evaluation as a controlled spike only, with correctness checks.
  - [x] Define Defluffer-style cleanup as lint/recommendation only.
  - [x] Defer Redis LangCache unless repeated app-level LLM calls justify it.
  - [x] Note provider prompt caching layout only for repo-owned LLM calls with stable prefixes.
- [x] Verify docs/workflow changes. (AC: 9)
  - [ ] Run `pnpm.cmd run check:docs` if available and in scope.
  - [x] If unavailable due sandbox/tooling, record the reason and the smallest next verification.

## Dev Notes

This story comes from the BMAD brainstorming session in the managed token-usage worktree:

- `_bmad-output/brainstorming/brainstorming-session-2026-06-13-200731.md`

The accepted baseline from brainstorming:

1. Spend tokens on irreversibility and insight.
2. Use quiet competent operator mode by default.
3. Escalate in plain English when something matters.
4. Stop repeated tool retries and route to RCA.
5. Keep progress visible without chatter.
6. Never compress away safety, approvals, uncertainty, or steering.

### Recommended First PR Shape

The first PR should be a foundation slice, not a tool-adoption slice:

- Agent behavior guidance for token economy.
- Tool Churn RCA workflow/spec.
- AI context entry map.
- Measurement/evaluation plan.
- Compression-tool spike criteria.

### Suggested Files

Likely files to create or update:

- `AGENTS.md`
- `docs/ai-context/index.md`
- `docs/workflows/tool-churn-rca.md`
- `docs/research/token-economy-tool-evaluation.md`
- `docs/stories/index.md`

Use existing docs folders if better local patterns are found. Do not create a parallel lifecycle if an existing docs/workflows or docs/goals pattern clearly fits better.

### Tool Notes

Initial research and brainstorming identified these candidates:

- `ccusage`: strongest low-risk measurement candidate; evaluate before relying on savings claims.
- Headroom: promising compression candidate; spike only, because compression can distort meaning or evidence.
- Caveman-style concise prompting: use as professional quiet-operator guidance, not novelty persona behavior.
- Defluffer-style cleanup: lint/recommendation only; do not mutate safety docs, acceptance criteria, or authority packets automatically.
- Redis LangCache: defer unless Kendall_Nxt has repeated app-level LLM calls.
- Provider prompt caching: consider only for repo-owned LLM calls where stable prefix layout is under project control.

### Guardrails

- Do not adopt Headroom or any compression layer in this story.
- Do not introduce live provider calls.
- Do not introduce paid usage.
- Do not launch Codex, Claude, subscription agents, workers, or other external processes.
- Do not mutate GitHub, merge, delete branches, cleanup worktrees, or sync issues.
- Do not read credentials, sessions, API keys, tokens, account settings, or MFA material.
- Do not remove approval gates, stop lines, verification evidence, safety boundaries, or Bob steering points.
- Do not make agents silent; preserve visible progress with low noise.

### Implementation Guidance

Keep the language accessible for Bob. Important explanations should translate technical details into operational meaning:

- What changed?
- Why does it matter?
- What happens next?

Avoid developer-only shorthand when writing policy intended to shape agent behavior.

For Tool Churn RCA, the minimal packet is:

```text
Tool Churn RCA Packet
- What failed
- Failure class
- Most likely cause
- Evidence
- Retry stop line
- One next safe action
- Durable fix recommendation
```

### Verification Guidance

Prefer the smallest relevant check first. For docs-only changes, start with:

```powershell
pnpm.cmd run check:docs
```

If the check cannot run because of sandbox, PATH, dependency, or safe-directory issues, record that explicitly in the Dev Agent Record and do not claim verification passed.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- pnpm.cmd run check:docs passed: Documentation index checks passed.
- pnpm.cmd run check passed after pnpm.cmd run setup:py created the missing supervisor virtualenv: preflight, docs checks, report drift checks, dashboard build, and 197 supervisor tests passed with 1 warning.
- BMAD brainstorming session accepted `bmad-brainstorming` AI-recommended sequence: First Principles Thinking, Solution Matrix, Constraint Mapping.
- `git -C <managed-worktree> rev-parse HEAD` could not verify baseline under the sandbox user because Git reported dubious ownership for the managed worktree.

### Completion Notes List

- Added AGENTS.md token economy guidance for quiet operator behavior, plain-English escalation, visible low-noise progress, safety non-negotiables, Tool Churn RCA routing, and context-entry-map usage.
- Added Tool Churn RCA workflow with triggers, failure classes, minimal packet, retry stop lines, next safe actions, durable fix paths, and non-goals.
- Added AI context entry map with task entry points, expansion rules, stop rules, and evidence style guidance.
- Added token-economy tool evaluation plan for ccusage, Headroom, Defluffer-style cleanup, provider prompt caching, Redis LangCache, and adoption gates.
- Verified docs with pnpm.cmd run check:docs.
- Ran full pnpm.cmd run check; it passed after setting up the missing supervisor virtualenv with pnpm.cmd run setup:py.
- Story created as a standalone ready-for-dev story because this new token-economy lane did not have `_bmad-output` sprint-status, epics, PRD, or architecture artifacts available in the worktree.
- The story intentionally scopes the first slice to docs/workflow policy and evaluation plans only.

### File List

- `AGENTS.md`
- `docs/ai-context/index.md`
- `docs/research/token-economy-tool-evaluation.md`
- `docs/stories/21-1-token-economy-foundation.md`
- `docs/stories/index.md`
- `docs/workflows/tool-churn-rca.md`

### Change Log

- 2026-06-13: Created Story 21.1 from token-economy brainstorming baseline.
- 2026-06-13: Started implementation and captured baseline commit.
- 2026-06-13: Implemented token economy foundation docs and verified docs index checks.
- 2026-06-13: Ran full repo check successfully and marked story ready for review.
- 2026-06-13: Completed BMAD code review, patched findings, reran docs check, and marked story done.
- 2026-06-13: Renumbered from 18.1 to 20.1 during rebase because current origin/main already contained Epic 18 and Epic 19 story maps.
- 2026-06-14: Renumbered from 20.1 to 21.1 during rebase because current origin/main already contained Epic 20.
- 2026-06-14: Updated token-economy tool evaluation matrix wording after PR review to avoid stale Story 18.1 scope labels.
## Senior Developer Review (AI)

Review date: 2026-06-13
Outcome: Approve after patch

### Findings

- [x] [Review][Patch] Staged review diff was stale after story-record updates; refreshed staged files so verification checkbox, file list, and baseline note match the working tree.
- [x] [Review][Patch] Adjacent markdown headings in `AGENTS.md` and `docs/stories/index.md` needed blank-line separation for reviewability; added spacing and reran docs verification.

### Verification

- `pnpm.cmd run check:docs` passed after review patches.
- Full `pnpm.cmd run check` passed before review patches and covered preflight, documentation/report drift checks, dashboard build, and 197 supervisor tests. Review patches were docs-only spacing/story-record changes and were rechecked with `check:docs`.
