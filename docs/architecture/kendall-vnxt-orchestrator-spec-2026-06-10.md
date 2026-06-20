# Kendall_vNxt Orchestrator Spec

Date: 2026-06-10
Status: draft technical spec

## Purpose

Define the first orchestrator architecture for Kendall_vNxt now that the system goal has shifted from LLM model routing to task orchestration across API and CLI worker lanes.

After interactive BMAD product discovery, Epic 6 is broader than a standalone worker router. The orchestrator is the integration layer for BMAD-method work creation, Chief of Staff intake, Dev Console visibility, supervisor service contracts, lane decisions, execution attempts, priority/order, evidence, Git/GitHub hygiene, delivery, and cleanup.

This spec builds on:

- `docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md`
- `docs/architecture/kendall-vnxt-orchestrator-mature-tool-comparison-2026-06-10.md`
- `docs/product/kendall-vnxt-orchestrator-jtbd-and-mvp-2026-06-10.md`
- `docs/workflows/product-requirements-boundary.md#kendall-vnxt-orchestrator-epic-6`

## Mature-Tool Posture

Epic 6 uses mature/self-hosted tooling before custom runtime code:

- Pilot LangGraph as the orchestration core for fake-worker scenarios.
- Keep Prefect as fallback if the problem is better modeled as general workflow operations.
- Keep existing Git worktree and GitHub CLI workspace protocol as the execution foundation.
- Defer Temporal, CrewAI, OpenHands, Dagger, n8n, Node-RED, Taskfile/just, and LiteLLM as orchestrator-core choices for the initial spike.
- Keep custom code limited to Kendall-specific policy, adapters, metadata-only evidence, fixtures, and retention enforcement.

## Architecture Summary

```text
Operator
  -> Chief of Staff
  -> BMAD-method workflows and skills
  -> Draft/Candidate Work
  -> Dev Console / supervisor service
  -> orchestrator task packet
  -> lane decision
  -> execution attempt/evidence
  -> Ollama API lane
  -> Codex CLI worker lane
  -> Claude Code CLI review lane
  -> GitHub workflow rails
  -> delivery and cleanup
```

The orchestrator routes bounded jobs. It does not route arbitrary prompts to arbitrary models.

The supervisor service remains the initial control and persistence boundary. The Dev Console is the user-facing projection of work state, attention, evidence, lane decisions, attempts, priority/order, and Git/GitHub hygiene. A separate orchestrator backend should be deferred until internal boundaries prove stable.

## Work Creation And Pipeline States

Epic 6 should support a staged work creation model:

1. Draft Work: rough idea, BMAD output, Chief of Staff request, or finding.
2. Candidate Work: structured proposed work, visible for review/priority and optionally preview-routed.
3. Active Dev Console Work Item: approved or immediate-mode work in the supervisor/orchestrator pipeline.
4. Orchestrated Execution: active work is routed, attempted, evidenced, blocked, reviewed, delivered, or completed.

BMAD and Chief of Staff may create Draft or Candidate work automatically. Active work requires operator approval or explicit immediate mode. Immediate mode does not bypass execution-authority gates.

## Progressive Authority Model

All automation follows a progressive ladder:

1. documented intent and stop lines,
2. contract/schema only,
3. preview/reporting only,
4. fake adapter or fixture-backed behavior,
5. dry-run against real tools with no durable side effects,
6. read-only real integration,
7. bounded write integration in isolated workspace or approved scope,
8. human-approved execution,
9. policy-approved semi-automation for low-risk repeatable paths,
10. continuous evidence, rollback, and deauthorization if behavior regresses.

This ladder applies to Codex, Claude, Ollama expansion, Git/GitHub operations, BMAD work creation, Dev Console controls, command execution, source mutation, delivery actions, and future specialist agents.

## Dev Console Integration

The Dev Console is a core architecture concern for Epic 6. Orchestration is not complete if it only exists in backend routing logic.

Initial technical direction:

- keep the current Next/React/Tailwind dashboard,
- keep the current FastAPI supervisor backend,
- keep SSE as the first realtime transport,
- add client-side live state fed by an initial snapshot plus streamed events,
- update cards, counts, details, attempts, evidence, and attention indicators in place,
- avoid timed full-page refresh loops,
- show stale-data status on stream disconnect,
- keep startup automation aligned with the supported Linux install path for the supervisor backend and Dev Console.

User-facing Dev Console language should avoid implementation jargon. Internal concepts such as execution attempts, routing decisions, blocked authority, verification failure, and selected lanes should be translated into approachable labels like Run, Why this path, Needs approval, Checks failed, and Assigned to.

## Priority, Work Order, And Git Hygiene

The orchestrator must account for work order and Git/GitHub hygiene:

- The operator can manually prioritize, reorder, pause, defer, pin, approve, or reject work.
- The system can recommend or automatically adjust order based on dependencies, blockers, risk, urgency, lane scarcity, failed checks, stale branches, or CI state.
- Automatic reordering must be visible and explainable.
- Git/GitHub hygiene includes clean working tree checks, isolated worktrees, branch ownership, base freshness, issue/story links, PR readiness, CI status, branch protection, review gates, merge readiness, stale cleanup, completed cleanup, and abandoned work recovery.

Git/GitHub operations must follow progressive authority: report-only, read-only checks, local workspace management, local commit prep, human-approved remote actions, policy-approved low-risk remote actions, human-approved merge, policy-approved merge/cleanup, and full hygiene automation.

## Lane Contracts

### Ollama API Lane

Purpose: cheap automated local reasoning.

Allowed work:

- task classification
- summaries
- draft plans
- local-safe explanations
- cheap validation

Required controls:

- exact approved endpoint/model allowlist
- short connection timeout
- total timeout
- no raw prompt/completion/reasoning retention
- metadata-only outcome recording

### Codex CLI Worker Lane

Purpose: primary implementation and performance coding.

Allowed work:

- code edits
- debugging
- test creation/update
- repo-wide reasoning
- verification command execution
- PR preparation

Required controls:

- isolated worktree per mutating job
- explicit task scope
- explicit verification command
- changed-file inventory
- diff capture
- timeout/budget
- blocked state on auth, sandbox, or command failure

### Claude Code CLI Review Lane

Purpose: scarce adversarial review and flaw finding.

Allowed work:

- review Codex output
- find bugs, regressions, missing tests, unsafe assumptions
- review security-sensitive or high-blast-radius diffs

Default mode:

- review-only
- no file edits
- findings ordered by severity
- scarce-use budget enforced by policy

Required controls:

- explicit review prompt template
- changed-file/diff input scope
- no broad implementation request unless the operator approves
- findings retained as review artifact

### GitHub Workflow Rail

Purpose: durable coordination and verification.

Allowed work:

- Issues as task inputs
- PRs as implementation artifacts
- Actions as verification
- branch protection and required checks as merge gates
- CODEOWNERS/reviewers as policy rails

Not responsible for:

- lane selection logic
- secret disclosure
- autonomous merge authority
- routine orchestration brain

## Job State Model

Recommended states:

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
- `ready_for_operator`

Every transition should include:

- timestamp
- actor/lane
- reason code
- status
- artifact references

## Lane Selection Inputs

- task kind
- risk tier
- file scope
- requires repo mutation
- requires independent review
- expected cost class
- approved authority family
- worker availability
- endpoint/model health
- verification requirement
- user approval state

## Initial Selection Policy

| Condition | Selected Lane |
| --- | --- |
| local-safe summary/classification/planning | Ollama |
| requires code edits or repo command execution | Codex CLI |
| Codex diff is high-risk, security-sensitive, or broad | Claude Code review |
| task needs PR/check/status workflow | GitHub rail |
| no lane has approval or availability | blocked |

## Failure Handling

| Failure | Required Behavior |
| --- | --- |
| Ollama unavailable | mark lane degraded, fall back to the operator/Codex only if policy allows |
| Codex CLI unavailable | block implementation job with auth/tooling diagnostic |
| Claude Code unavailable | block review or require operator manual review |
| verification fails | keep worktree, record failure, return to Codex or the operator |
| scope expands | pause for operator approval |
| budget exhausted | stop cleanly and record budget-exhausted reason |
| conflicting reviews | require operator decision |

## Retention Rules

Retain:

- job ID
- task metadata
- lane selected
- reason codes
- worktree path
- PR/issue links
- changed files
- verification command and status
- review findings
- summarized blockers
- timing and usage metadata

Do not retain:

- raw prompts
- raw completions
- reasoning traces
- raw provider payloads
- secrets
- unnecessary source copies outside Git artifacts

## Acceptance Criteria

- `AC-ORCH-001`: Orchestrator selects a worker lane by task type, risk, budget, and required review depth.
- `AC-ORCH-002`: Ollama lane handles approved low-cost local inference and API-callable model tasks.
- `AC-ORCH-003`: Codex CLI lane handles approved implementation work with isolated repo write/test authority.
- `AC-ORCH-004`: Claude Code CLI lane handles bounded adversarial review and is review-only by default.
- `AC-ORCH-005`: GitHub workflow rail provides issue, PR, check, and branch-protection support without owning lane selection.
- `AC-ORCH-006`: Every lane invocation emits traceable status, exit state, cost/time budget metadata, and artifact links.
- `AC-ORCH-007`: Orchestrator has deterministic fallback or blocked behavior when a lane is unavailable.
- `AC-ORCH-008`: No merge path exists without green verification and configured review gate satisfaction.
- `AC-ORCH-009`: No raw prompts, completions, reasoning traces, or provider payloads are retained.
- `AC-ORCH-010`: The operator can resume from the latest job record without relying on chat memory.

## Spike Scenarios

The first implementation spike should pass these scenarios:

1. Small local reasoning task selects Ollama.
2. Code implementation task selects Codex CLI.
3. High-risk Codex diff requests Claude Code review.
4. Ollama unavailable produces a degraded/blocked state.
5. Codex CLI unavailable produces a tooling/auth blocked state.
6. Failed verification keeps the worktree and records failure.
7. Budget exhaustion stops cleanly.
8. Conflicting review result requires operator decision.
9. Scope expansion requires operator approval.
10. Completed job records enough metadata to resume.

## Implementation Notes

- Start with a deterministic lane selector.
- Use scripted fake workers for initial tests before invoking Codex/Claude.
- Add real Codex CLI execution only after command behavior and auth are verified.
- Add real Claude Code execution only after review-only invocation behavior is verified.
- Keep LiteLLM deferred until multiple API-callable providers exist.

## Open Technical Questions

- Minimum viable Task Packet v0 for synthetic BMAD story integration.
- Whether Candidate Work should be a new persisted model, a non-active work item state, or a file-backed proposal for the first slice.
- Which existing routing preview contracts should be promoted or renamed into orchestrator lane decision contracts.
- How SSE event payloads should patch Dev Console live state without full refresh.
- Which Git/GitHub hygiene checks should appear before work starts, before review, and before delivery.
- Exact non-interactive Codex CLI command shape for worker jobs.
- Exact non-interactive Claude Code CLI command shape for review-only jobs.
- Whether Claude Code review should consume subscription usage or API usage in the configured environment.
- Canonical task queue: GitHub Issues, local manifests, dashboard commands, or hybrid.
- Where job state should live first: existing supervisor storage or a new orchestrator table.
