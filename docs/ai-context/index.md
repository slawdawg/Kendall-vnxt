# AI Context Entry Map

Date: 2026-06-13
Status: active guidance

## Purpose

Help agents start with the smallest useful context for Kendall_Nxt work. This
map reduces repeated large reads while preserving source links, safety gates,
and Bob's ability to steer.

## Default Reading Rule

Start narrow, then expand only when the task crosses a boundary. Prefer:

1. The user request and active story/spec.
2. `AGENTS.md` sections relevant to the task.
3. One nearby implementation or docs example.
4. Targeted `rg` searches for exact symbols, commands, or story keys.
5. Broader architecture, PRD, or handoff documents only when the task needs them.

Do not paste large documents into chat when a source path and short summary are
enough. Keep exact file links and line references for decisions and evidence.

## Task Entry Points

| Task type | Read first | Expand when |
| --- | --- | --- |
| Start/list/resume/finish Codex workspace work | `AGENTS.md#codex-workspace-protocol`, `docs/workflows/workspace-coordination-report.md`, `scripts/codex-workspace.mjs` usage text | Workspace state is stale, cleanup is requested, PR delivery is needed |
| BMAD story implementation | The story file, `AGENTS.md`, nearest similar story in `docs/stories/` | Story references architecture, PRD, UX, prior evidence, or code contracts |
| BMAD planning/story/PRD/architecture work | Matching `.agents/skills/bmad-*` `SKILL.md`, then directly referenced step files | The skill requests planning artifacts or continuation state |
| Tool or command failure | `AGENTS.md#tool-resolution-and-verification`, `AGENTS.md#windows-sandbox`, `docs/workflows/tool-churn-rca.md` | The failure repeats, requires authority, points to brittle tooling, or needs Tool Churn RCA examples from `docs/workflows/tool-churn-rca-examples.md` |
| Git/GitHub delivery | `AGENTS.md#codex-workspace-protocol`, relevant delivery/readiness story, current PR/CI evidence | Push, PR creation, merge, branch deletion, cleanup, or issue sync is requested |
| Windows/PowerShell behavior | `AGENTS.md#windows-sandbox`, `AGENTS.md#powershell-commands` | Scheduler, ACL, PATH, or sandbox behavior remains unclear |
| Supervisor/dashboard code changes | Relevant story, nearby tests, package scripts, target app/service files | API contracts, UI state, or cross-package behavior changes |
| KNX governance or safety work | Matching `.agents/skills/knx-*` skill, `_bmad/memory/knx/` documents if present | Source/evidence boundaries, execution policy, or safety validation expands |
| Research/tool evaluation | Current story/spec, `docs/research/token-economy-tool-evaluation.md`, official docs or primary sources | Adoption, installation, paid usage, or networked integration is proposed |

## Expansion Rules

Expand context when:

- A decision affects authority, safety, retention, evidence, or Bob approval.
- A file will be edited and nearby examples are needed for local style.
- Verification failure names a specific script, package, or contract.
- The task crosses from docs into code, from local into remote, or from read-only into mutation.
- A claim depends on current external tool behavior or official documentation.

## Stop Rules

Stop expanding context when:

- The next file read would only restate already loaded policy.
- The task can be completed with the active story, one local example, and targeted search results.
- A broader read is tempting only because it feels safer, not because a decision needs it.
- The current blocker is a tool failure that should route to Tool Churn RCA instead.

## Evidence Style

Use links and summaries instead of full copies:

- Cite exact source paths in docs and final summaries.
- Preserve line references where review needs them.
- Summarize large artifacts in a few sentences before deciding whether to open more.
- Keep ignored local BMAD artifacts out of committed source citations unless the story explicitly says they are local-only provenance.

## Non-Goals

This map is not a new source of truth for product or architecture decisions. It
routes agents to existing sources and tells them when to stop reading.
