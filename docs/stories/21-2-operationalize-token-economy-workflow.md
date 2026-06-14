---
baseline_commit: 0ac467c3874198e20d6b1dbcf8785243774d7377
---

# Story 21.2: Operationalize Token Economy Workflow

Status: ready-for-review

## Story

As Bob,
I want the token-economy and Tool Churn RCA guidance to become a directly usable workflow with drift checks and examples,
so that future Codex sessions stop wasteful retries quickly and preserve the lessons in repo artifacts instead of relying on chat memory.

## Acceptance Criteria

1. Given command or tool churn appears, when an agent needs the RCA path, then the repo exposes a clear first-read workflow entry point that can be invoked by name from `AGENTS.md`, `docs/ai-context/index.md`, and story/dev handoffs.
2. Given the Tool Churn RCA workflow exists, when this story completes, then it includes concrete example RCA packets for at least Windows sandbox runner timeout, PowerShell quoting/parser failure, missing Python/venv or tool path confusion, and Git or permission denial.
3. Given token-economy guidance is operationalized, when `pnpm.cmd run check` runs, then a static drift check verifies `AGENTS.md`, `docs/ai-context/index.md`, `docs/workflows/tool-churn-rca.md`, and this story remain aligned.
4. Given a repeated tool failure occurs, when the RCA packet is produced, then the packet names the failure class, evidence, retry stop line, one next safe action, and one durable fix recommendation.
5. Given this story is workflow/check automation only, when it completes, then it does not install external token tools, adopt compression/cache layers, perform provider calls, launch workers/processes, mutate GitHub, clean worktrees, access credentials, or approve new execution authority.
6. Given implementation is complete, when verification runs, then `pnpm.cmd run check:token-economy` passes and the full `pnpm.cmd run check` includes that check.

## Tasks / Subtasks

- [x] Add a direct operational entry point for token economy and Tool Churn RCA. (AC: 1, 4)
  - [x] Update `AGENTS.md` to name the workflow and examples path clearly.
  - [x] Update `docs/ai-context/index.md` to route repeated tool failures to the workflow before broad context loading.
  - [x] Preserve quiet competent operator behavior and plain-English escalation guidance.
- [x] Add Tool Churn RCA examples. (AC: 2, 4)
  - [x] Add examples for Windows sandbox runner timeout before command output.
  - [x] Add examples for PowerShell quoting/parser errors.
  - [x] Add examples for missing supervisor venv, Python path, package manager, or direct tool resolution confusion.
  - [x] Add examples for Git safe-directory, permission, or ownership denial.
- [x] Add token-economy drift check. (AC: 3, 6)
  - [x] Add `scripts/check-token-economy.mjs`.
  - [x] Add `check:token-economy` to `package.json`.
  - [x] Add `pnpm run check:token-economy` to the full `check` chain.
  - [x] Make failure output name the missing or stale expectation.
- [x] Verify. (AC: 6)
  - [x] Run `pnpm.cmd run check:token-economy`.
  - [x] Run `pnpm.cmd run check:docs`.
  - [x] Run full `pnpm.cmd run check` because the package script chain changes.

## Dev Notes

### Source Context

Start with these files:

- `docs/stories/21-1-token-economy-foundation.md`
- `AGENTS.md`
- `docs/ai-context/index.md`
- `docs/workflows/tool-churn-rca.md`
- `docs/research/token-economy-tool-evaluation.md`
- `docs/handoffs/codex-handoff-2026-06-14-token-economy-foundation.md`

Story 21.1 established the policy foundation:

- Spend tokens on irreversibility and insight.
- Use quiet competent operator mode by default.
- Explain important changes in plain English.
- Stop repeated tool retries and route to Tool Churn RCA.
- Keep progress visible without chatter.
- Never compress away safety, approvals, uncertainty, or Bob steering.

This story makes that policy harder to ignore in future sessions by adding examples and a static check.

### Existing Workflow

`docs/workflows/tool-churn-rca.md` already defines trigger conditions, failure classes, RCA packet shape, retry stop lines, next safe actions, durable fix paths, and non-goals.

Do not replace this with a parallel workflow. Extend it in place.

Do not create a new BMAD skill in this story unless Bob explicitly expands the scope. The first operationalization step is repo-owned docs plus a deterministic drift check.

### Expected Implementation Shape

Likely files:

- `docs/workflows/tool-churn-rca.md`
- `docs/workflows/tool-churn-rca-examples.md`
- `docs/ai-context/index.md`
- `AGENTS.md`
- `scripts/check-token-economy.mjs`
- `package.json`
- `docs/stories/index.md`
- `docs/stories/21-2-operationalize-token-economy-workflow.md`

Use exact string checks for stable policy anchors. Keep the script small and deterministic, matching the style of existing repo drift checks.

### Guardrails

Do not:

- install or adopt Headroom, CC Usage, Defluffer, Redis LangCache, provider prompt caching, or other external token tools,
- call providers or paid APIs,
- launch Codex, Claude, subscription agents, workers, or shell commands as managed runtime actions,
- mutate GitHub, merge PRs, sync issues, or cleanup worktrees,
- read credentials, sessions, API keys, tokens, account settings, or MFA material,
- remove approval gates, stop lines, evidence requirements, or Bob steering points.

### Verification Guidance

Run the smallest check first:

```powershell
pnpm.cmd run check:token-economy
```

Then run:

```powershell
pnpm.cmd run check:docs
```

Because this story changes `package.json`, also run:

```powershell
pnpm.cmd run check
```

If verification fails because of environment setup rather than story behavior, create a Tool Churn RCA packet before retrying the same command shape.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run check:token-economy` passed: token economy drift checks passed.
- `pnpm.cmd run check:docs` passed: documentation index checks passed.
- Initial `pnpm.cmd run check` stopped at preflight because the fresh worktree was missing `services/supervisor/.venv`; this matched the missing supervisor virtual environment RCA example.
- `pnpm.cmd run setup:py` created the supervisor virtual environment for this worktree.
- Final `pnpm.cmd run check` passed: preflight, docs/report drift checks, token-economy drift check, dashboard build, and 197 supervisor tests passed with 1 existing `aiosqlite` deprecation warning.

### Completion Notes List

- Added a direct RCA examples path from `AGENTS.md` and the AI context map.
- Added Tool Churn RCA example packets for Windows sandbox timeout, PowerShell quoting/parser errors, missing supervisor venv/tool path confusion, and Git safe-directory or permission denial.
- Added `scripts/check-token-economy.mjs` and wired `check:token-economy` into `pnpm run check`.
- Verified focused docs and full repo checks after setting up the supervisor virtual environment.

### File List

- `AGENTS.md`
- `docs/ai-context/index.md`
- `docs/stories/21-2-operationalize-token-economy-workflow.md`
- `docs/stories/index.md`
- `docs/workflows/tool-churn-rca-examples.md`
- `docs/workflows/tool-churn-rca.md`
- `package.json`
- `scripts/check-token-economy.mjs`

### Change Log

- 2026-06-14: Created Story 21.2 from token-economy handoff and Story 21.1 foundation.
- 2026-06-14: Implemented Tool Churn RCA examples and token-economy drift check.
- 2026-06-14: Verified focused token-economy/docs checks and full `pnpm.cmd run check`; marked ready for review.
