---
baseline_commit: fa2acc1
---

# Story 2.8: Threat Boundary For Commands, Prompts, Providers, And Secrets

Status: done

## Story

As the Kendall_vNxt operator,
I want a formal, inspectable worker threat boundary,
so that future real worker/provider execution cannot be enabled until prompts, commands, provider endpoints, network access, credentials, and artifacts have explicit safety rules and rejection evidence.

## Acceptance Criteria

1. The architecture docs define the prompt/evidence redaction boundary before any real model calls are enabled.
2. The supervisor exposes a read-only threat-boundary API surface.
3. The boundary identifies allowed prompt/evidence sources and excluded secret/provider/filesystem state.
4. The boundary identifies allowed command classes and blocked command classes.
5. The boundary states that local/remote provider endpoints and worker network access remain denied unless later policy approves them.
6. The boundary states that credential access remains forbidden.
7. Execution attempts include boundary metadata and stable rejection reasons when real worker execution remains blocked.
8. Local evidence packets carry the redaction and provider/credential boundary.
9. Focused tests prove the endpoint and evidence surfaces do not mutate workflow events and do not enable process launch, provider/model calls, premium execution, command execution, source mutation, network access, or credential access.
10. Existing routing, attempt, dashboard, and supervisor checks continue to pass.

## Tasks / Subtasks

- [x] Add architecture threat-boundary doc. (AC: 1, 3, 4, 5, 6)
  - [x] Define redaction and prompt/evidence sources.
  - [x] Define command allowlist and blocked command classes.
  - [x] Define provider/network, credential, artifact, and rejection-reason boundaries.
- [x] Add supervisor threat-boundary contract. (AC: 2, 3, 4, 5, 6)
  - [x] Add supervisor API schema.
  - [x] Add shared TypeScript contract.
  - [x] Add read-only `GET /supervisor/threat-boundary`.
- [x] Wire boundary into existing evidence. (AC: 7, 8)
  - [x] Add redaction and command/provider metadata to workspace isolation plans.
  - [x] Add disabled authority flags and boundary rejection metadata to attempt events.
  - [x] Add provider and credential boundary copy to local evidence packets.
- [x] Add focused tests. (AC: 2, 7, 8, 9)
  - [x] Assert threat-boundary endpoint fields and disabled flags.
  - [x] Assert endpoint does not mutate events.
  - [x] Assert attempts and local packets carry boundary evidence.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and threat-boundary tests.
  - [x] Run routing preview suite.
  - [x] Run workspace check.
  - [x] Update Dev Agent Record, File List, Change Log, and goal trail.

## Dev Notes

Source artifacts:

- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/stories/2-7-runtime-evidence-export-strategy.md`

Current implementation context:

- Disabled execution configuration checks already prove real process/provider/model/source/network/credential authority is disabled by default.
- Runtime evidence export already excludes credentials, provider payloads, and filesystem snapshots outside artifact references.
- This story formalizes and exposes the boundary; it does not enable any new execution authority.

GitHub progress context:

- Local branch `main` was clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 7`, local branch seven commits ahead of `origin/main`.
- `git fetch origin` failed because GitHub credentials cannot be read non-interactively:
  - `fatal: Unable to persist credentials with the 'wincredman' credential store.`
  - `fatal: could not read Username for 'https://github.com': No such file or directory`
- Push remains gated until GitHub auth and external remote approval are handled.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add arbitrary shell command execution.
- Do not mutate source files as part of execution attempts.
- Do not read credentials, raw environment values, local secret files, or account/security state.
- Do not add background runtime assistant behavior.

## Dev Agent Record

### Implementation Plan

- Add targeted architecture threat-boundary documentation.
- Add reusable supervisor/shared contracts for the boundary.
- Expose a read-only boundary endpoint.
- Embed boundary metadata in attempt isolation plans/events and local evidence packets.
- Add focused tests for endpoint, non-mutation, disabled flags, and evidence propagation.
- Run focused and broad verification, then commit.

### Debug Log References

- `git status --short` - clean before Story 2.8 work.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 7`, local branch seven commits ahead of `origin/main`.
- `git fetch origin` - failed because GitHub credentials cannot be read non-interactively.
- Sandbox file reads timed out; repository reads were rerun with escalation.
- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "threat_boundary or local_evidence_packet or execution_attempt_plans"` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed.
- `pnpm run check` - passed, dashboard build plus 77 supervisor tests; emitted one aiosqlite event-loop thread warning after a passing test run.

### Completion Notes List

- Added `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`.
- Added `ThreatBoundaryView` and `ThreatBoundaryRuleView` in supervisor and shared contracts.
- Added read-only `GET /supervisor/threat-boundary`.
- Added redaction, command, provider, prompt, and boundary rejection metadata to workspace isolation plans.
- Added boundary rejection and disabled authority flags to execution attempt events.
- Added provider and credential boundary text to local evidence packets and explanations.
- Focused tests assert the endpoint is non-mutating and all real execution authority flags remain false.

### File List

- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/stories/2-8-threat-boundary-for-commands-prompts-providers-and-secrets.md`
- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 8.
- 2026-06-08: Implemented threat-boundary docs, API contract, evidence propagation, focused tests, and verification; status moved to done.
