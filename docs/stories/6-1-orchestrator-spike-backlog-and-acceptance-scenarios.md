# Story 6.1: Orchestrator Spike Backlog And Acceptance Scenarios

Status: done
Date: 2026-06-10

## Story

As Bob,
I want a concrete spike backlog for the Kendall_vNxt orchestrator,
so that we can validate lane selection, worker contracts, failure handling, and evidence capture before enabling real Codex or Claude process automation.

## Context

The research direction shifted from "LLM router" to "task orchestrator." Kendall currently has:

- Ollama API lane: approved only for the VM-to-host `qwen3:14b` endpoint/model boundary.
- Codex CLI worker lane: desired performance/implementation lane, not yet approved for orchestrated process launch in this story.
- Claude Code CLI worker lane: desired scarce adversarial review lane, not yet approved for orchestrated process launch in this story.
- GitHub Pro workflow rails: Issues, PRs, Actions, branch protections, and review gates.

This story defines a fake-worker-first spike backlog. It does not approve real Codex CLI launch, real Claude Code CLI launch, merge automation, hosted routing gateways, or new provider/model authority.

Related artifacts:

- `docs/product/kendall-vnxt-orchestrator-jtbd-and-mvp-2026-06-10.md`
- `docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md`
- `docs/architecture/kendall-vnxt-orchestrator-spec-2026-06-10.md`
- `docs/architecture/kendall-vnxt-orchestrator-mature-tool-comparison-2026-06-10.md`
- `_bmad/memory/knx/decisions/mature-tool-orchestrator-lane-architecture-2026-06-10.md`

## Mature-Tool Gate

Before implementing custom orchestrator runtime code, use the mature-tool decision for this story:

- Pilot LangGraph as the orchestration core for fake-worker scenarios.
- Keep existing Git worktree and GitHub CLI workspace protocol as the execution foundation.
- Keep Prefect as fallback if the work is better modeled as general workflow operations.
- Defer Temporal, CrewAI, OpenHands, Dagger, n8n, Node-RED, Taskfile/just, and LiteLLM as orchestrator-core choices for the initial spike.

Custom code must stay limited to Kendall-specific policy, adapters, metadata-only evidence, fixtures, and retention enforcement unless the mature-tool review records why a broader custom implementation is justified.

## Acceptance Criteria

### AC-ORCH-001: Deterministic Lane Selection

Given a task metadata packet,
when the orchestrator evaluates task kind, risk, budget, file scope, review depth, approval state, and worker availability,
then it selects one of:

- `ollama_api`
- `codex_cli_worker`
- `claude_code_review_worker`
- `github_workflow_rail`
- `blocked`

and records reason codes for the selection.

### AC-ORCH-002: Fake Workers First

Given the spike is running without real Codex or Claude process approval,
when a task selects Codex or Claude,
then the orchestrator invokes fake worker adapters that return deterministic fixtures,
and no real external process is launched.

### AC-ORCH-003: Ollama Economy Lane

Given a local-safe classification, summary, draft plan, or cheap validation task,
when the approved Ollama gate is enabled,
then the orchestrator may select the Ollama API lane.

Given the task requires repo mutation, broad code review, secrets, or high-risk final authority,
then the orchestrator must not select Ollama as the final execution lane.

### AC-ORCH-004: Codex Implementation Lane Contract

Given a code implementation task,
when the task requires repo edits, debugging, test updates, or command execution,
then the orchestrator selects `codex_cli_worker` and records:

- worktree requirement
- allowed file scope
- verification command
- expected artifact list
- timeout/budget metadata

During this spike, the selected worker is fake unless separate approval enables real Codex CLI process launch.

### AC-ORCH-005: Claude Review Lane Contract

Given a Codex implementation result is high-risk, security-sensitive, broad in scope, or explicitly marked for independent review,
then the orchestrator selects `claude_code_review_worker` for review-only work.

The review contract must require findings ordered by severity and must not authorize file edits by default.

During this spike, the selected worker is fake unless separate approval enables real Claude Code CLI process launch.

### AC-ORCH-006: GitHub Workflow Rail Contract

Given a task needs durable issue, PR, status-check, or branch-protection handling,
then the orchestrator records GitHub workflow rail requirements without making GitHub the lane-selection brain.

### AC-ORCH-007: Failure And Fallback Behavior

Given a lane is unavailable, unauthorized, over budget, or fails verification,
then the orchestrator must produce a deterministic state:

- `blocked`
- `failed`
- `awaiting_approval`
- `ready_for_bob`

and must retain the reason code and artifact references needed to resume.

### AC-ORCH-008: Evidence And Retention Boundary

Every orchestrator decision and worker attempt must retain:

- job ID
- task metadata summary
- selected lane
- reason codes
- worker status
- artifact links
- verification status
- timing/usage metadata where available

It must not retain:

- raw prompts
- raw completions
- reasoning traces
- raw provider payloads
- secrets

### AC-ORCH-009: Resume Without Chat Memory

Given a job is blocked, failed, or completed,
when Bob asks to resume,
then the latest job record contains enough metadata to explain current state, next action, blocker, and verification status without relying on chat transcript memory.

### AC-ORCH-010: No Merge Path

No orchestrator spike path may merge code, bypass branch protection, bypass review gates, or mark real implementation work complete without green verification and configured review satisfaction.

## Spike Backlog

### Spike 1: Job Metadata Schema

Define the prompt-free job metadata packet:

- job ID
- task kind
- risk tier
- budget class
- file scope
- requires repo mutation
- requires review
- approval state
- requested verification command
- source reference

Output: schema or typed model plus fixture examples.

### Spike 2: Deterministic Lane Selector

Pilot deterministic selection rules in LangGraph with fake workers for:

- Ollama local-safe work
- Codex implementation work
- Claude review work
- GitHub workflow rail work
- blocked unauthorized work

Output: unit tests covering all lane outcomes.

### Spike 3: Fake Worker Adapter Contracts

Create fake adapters for:

- Codex implementation worker
- Claude review worker
- GitHub workflow rail

Output: deterministic fixture results and no real process launch.

### Spike 4: Job State Machine

Implement states:

- `created`
- `classified`
- `lane_selected`
- `awaiting_approval`
- `running`
- `verification_running`
- `review_running`
- `blocked`
- `failed`
- `completed`
- `ready_for_pr`
- `ready_for_bob`

Output: transition tests with reason codes.

### Spike 5: Evidence Record

Persist or export metadata-only job records with:

- lane decision
- worker attempt summary
- verification result
- artifact references
- next action

Output: no raw prompt/completion retention tests.

### Spike 6: Scenario Fixtures

Create 10 scripted scenarios:

1. Small local reasoning selects Ollama.
2. Code implementation selects Codex fake worker.
3. High-risk code diff selects Claude fake review worker.
4. GitHub issue-to-PR task records GitHub workflow rail need.
5. Ollama unavailable produces degraded/blocked state.
6. Codex unavailable produces tooling/auth blocked state.
7. Claude budget exhausted requires Bob decision.
8. Verification failure keeps state resumable.
9. Scope expansion requires approval.
10. Conflicting review requires Bob decision.

Output: tests or static fixture validations.

### Spike 7: Dashboard Or Report Preview

Expose read-only orchestrator status:

- selected lane
- reason codes
- current state
- blocker
- next action
- artifact links

Output: read-only report or dashboard panel, no command buttons.

## Verification Plan

Initial verification should be scoped:

1. Unit tests for selector and state machine.
2. Fixture tests proving fake workers do not launch real processes.
3. Retention tests proving raw prompt/completion/provider payloads are not stored.
4. Existing supervisor focused tests if touched.
5. Full check only when implementation touches shared contracts or dashboard surfaces.

## Explicit Non-Approvals

This story does not approve:

- real Codex CLI process launch
- real Claude Code CLI process launch
- hosted router or hosted gateway usage
- new OpenAI, Anthropic, GitHub Models, or cloud API billing
- autonomous merge
- branch protection bypass
- raw prompt/completion retention
- arbitrary shell execution

## Definition Of Done

- Spike backlog is documented and linked from the story index.
- Acceptance criteria are testable.
- Real process-launch authority remains explicitly blocked.
- The first implementation slice can be selected without relying on chat memory.

## Dev Record

### Implementation Notes

- Added `services/supervisor/src/supervisor/domain/orchestrator.py`.
- Added deterministic job metadata, lane selection, fake worker attempts, and metadata-only evidence records.
- Added explicit fake-worker coverage for all 10 scripted Story 6.1 scenarios.
- Added `FakeOrchestratorGraph` as a LangGraph pilot boundary without introducing the LangGraph dependency yet.
- Real Codex CLI and Claude Code CLI process launch remain blocked.
- No external sends or process launches are attempted by the fake workers.

### Verification

- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_orchestrator_fake_workers.py -q`
  - Result: 11 passed.
- `node .\scripts\run-supervisor-tests.mjs`
  - Result: 115 passed.
- `pnpm.cmd run check`
  - Result: passed, including documentation drift checks, dashboard build, and 115 supervisor tests.

### Files

- `services/supervisor/src/supervisor/domain/orchestrator.py`
- `services/supervisor/tests/integration/test_orchestrator_fake_workers.py`
