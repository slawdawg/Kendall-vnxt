# Story 21.4: Token Economy Measurement Readiness

Status: done

## Story

As Bob,
I want token-economy improvements to require lightweight measurement evidence,
so that future agents can improve efficiency without making unsupported savings
claims or hiding safety-critical context.

## Acceptance Criteria

1. Given future token-economy work proposes savings, when it records evidence,
   then a baseline packet captures workflow type, task boundary, context loaded,
   major tool calls, repeated failures, verification outcome, preserved safety
   signals, duration, usage source, confidence, and follow-up recommendation.
2. Given measurement guidance is added, when an agent chooses workflow samples,
   then it includes BMAD story implementation, Tool Churn RCA diagnosis,
   documentation update with verification, research/tool evaluation, and PR
   delivery or review-comment resolution.
3. Given external usage or compression tools are considered, when this story
   completes, then the guidance keeps them evaluation-only unless a later story
   proves data sources, credential/session boundaries, before/after evidence,
   failure cases, rollback, and disabled-by-default behavior.
4. Given token-economy drift checks run, when `pnpm.cmd run check:token-economy`
   executes, then it verifies the measurement-readiness artifact, Story 21.4,
   baseline packet fields, workflow samples, and adoption-gate constraints.
5. Given this story is docs/check automation only, when it completes, then it
   does not install tools, call providers, spend money, launch workers/processes,
   mutate GitHub, clean worktrees, read credentials, or retain raw prompts,
   completions, reasoning traces, provider payloads, or secrets.

## Tasks / Subtasks

- [x] Add measurement-readiness guidance. (AC: 1, 2, 3, 5)
  - [x] Define the baseline packet.
  - [x] Define representative workflow samples.
  - [x] Define allowed and disallowed measurement sources.
  - [x] Define comparison rules and adoption gates.
- [x] Extend token-economy drift checks. (AC: 4)
  - [x] Verify the measurement-readiness artifact exists.
  - [x] Verify baseline packet fields.
  - [x] Verify workflow samples.
  - [x] Verify adoption-gate constraints.
  - [x] Verify Story 21.4 is indexed.
- [x] Verify. (AC: 4)
  - [x] Run `pnpm.cmd run check:token-economy`.
  - [x] Run `pnpm.cmd run check:docs`.

### Review Findings

- [x] [Review][Patch] Align measurement-readiness retention wording with Story 21.4 raw prompt/completion/reasoning/provider-payload guardrail [`docs/research/token-economy-measurement-readiness.md`]
- [x] [Review][Patch] Route token-economy research and savings claims through measurement readiness in the AI context map [`docs/ai-context/index.md`]

## Dev Notes

This story follows Story 21.1 and Story 21.2. It remains evidence planning and
drift-check work only. It does not evaluate or install `ccusage`, Headroom,
Defluffer, Redis LangCache, provider prompt caching, or any other external
tool.

### Guardrails

- Do not install external token tools.
- Do not call providers or paid APIs.
- Do not launch workers or managed runtime processes.
- Do not mutate GitHub except normal PR delivery when Bob requests it.
- Do not clean worktrees or delete branches.
- Do not read credentials, sessions, API keys, tokens, account settings, or MFA
  material.
- Do not retain raw prompts, completions, reasoning traces, provider payloads,
  or secrets.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `pnpm.cmd run check:token-economy` passed: token economy drift checks passed.
- `pnpm.cmd run check:docs` passed: documentation index checks passed.
- Local BMAD review found one wording alignment patch for raw retention guardrails.
- Codex PR review found one route gap in the AI context map; patched and added drift-check coverage.

### Completion Notes List

- Added `docs/research/token-economy-measurement-readiness.md`.
- Extended token-economy drift checks for measurement readiness.
- Verified focused token-economy and docs checks.
- Applied local BMAD review patch for raw retention boundary wording and drift-check coverage.
- Addressed Codex PR review feedback by routing research/tool evaluation to measurement readiness.

### File List

- `docs/research/token-economy-measurement-readiness.md`
- `docs/stories/21-4-token-economy-measurement-readiness.md`
- `docs/stories/index.md`
- `scripts/check-token-economy.mjs`

### Change Log

- 2026-06-14: Created measurement-readiness guidance.
- 2026-06-14: Verified focused checks and marked story done.
- 2026-06-14: Applied local BMAD review patch for retention guardrail wording.
- 2026-06-14: Addressed PR review feedback for AI context routing.
- 2026-06-14: Renumbered measurement readiness to Story 21.4 during rebase after Story 21.3 was assigned to Tool Churn RCA drift-check hardening.
