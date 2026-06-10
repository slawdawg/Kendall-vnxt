# PRD: Epic 6 - Kendall_vNxt Orchestrator And Dev Console Integration

Date: 2026-06-10
Status: Draft, Story 6.1 approved for fake-worker spike only

## Summary

Epic 6 turns Kendall_vNxt from a set of useful prototypes into an integrated product-development pipeline.

The epic is not a standalone LLM router. It is the integration layer where BMAD-method planning, Chief of Staff intake, Dev Console visibility, supervisor contracts, orchestrator lane decisions, execution attempts, evidence, Git/GitHub hygiene, and progressive automation begin working as one system.

North-star flow:

```text
Bob has an idea
  -> BMAD expands, researches, and structures it
  -> Draft or Candidate Work is created
  -> Bob approves or uses immediate mode
  -> Active Dev Console Work Item enters the pipeline
  -> Orchestrator routes and controls execution
  -> work is implemented, checked, reviewed, delivered, and cleaned up
```

## Product Surfaces

| Surface | Role |
| --- | --- |
| Chief of Staff | Broad executive-assistant front door. Clarifies, splits, and delegates work across agents/resources. |
| BMAD-method | Structured planning, elicitation, research, PRD, architecture, story, and review workflow source. |
| Dev Console | Bob's visual software pipeline window for proposed, active, blocked, review, and completed development work. |
| Supervisor service | Existing backend control/persistence API for work items, states, events, attempts, evidence, gates, and reports. |
| Orchestrator | Shared dispatch/control layer for task packets, lane decisions, authority, execution attempts, evidence, and escalation. |

The dashboard-facing "Supervisor" name should move toward "Dev Console." The internal `supervisor` service name remains stable for now.

## Work Creation Model

Epic 6 uses staged work creation:

1. Draft Work: rough idea, BMAD output, Chief of Staff request, or finding.
2. Candidate Work: structured proposed work, visible for review/priority and optionally preview-routed.
3. Active Dev Console Work Item: approved or immediate-mode work in the supervisor/orchestrator pipeline.
4. Orchestrated Execution: active work is routed, attempted, evidenced, blocked, reviewed, delivered, or completed.

Rules:

- BMAD and Chief of Staff may create Draft/Candidate work automatically.
- Active work requires Bob approval or explicit immediate mode.
- Candidate work can be preview-routed.
- Only Active work can execute.
- Immediate mode never bypasses execution-authority gates.

## Current Lane Model

| Lane | Current Role | Current Authority |
| --- | --- | --- |
| Ollama API | Economy local reasoning, classification, summaries, safe planning | Approved only within existing Story 4.4 endpoint/model boundary until expanded |
| Codex CLI worker | High-performance implementation lane | Fake/blocked in Story 6.1; progressive authority required before real launch |
| Claude Code CLI worker | Scarce adversarial review lane | Fake/blocked in Story 6.1; progressive authority required before real review |
| GitHub workflow rail | Issues, PRs, checks, branch protection, durable coordination | Planning/metadata/read-only first; progressive authority for live operations |
| BMAD-method | Planning/research/story creation | Produces Draft/Candidate work by default; immediate mode requires explicit Bob direction |
| Dev Console | Visual pipeline and approval surface | Displays and controls projected state; does not own backend state |

## Progressive Authority

All automation follows a progressive ladder:

1. Documented intent and stop lines.
2. Contract/schema only.
3. Preview/reporting only.
4. Fake adapter or fixture-backed behavior.
5. Dry-run against real tools with no durable side effects.
6. Read-only real integration.
7. Bounded write integration in isolated workspace or approved scope.
8. Human-approved execution.
9. Policy-approved semi-automation for low-risk repeatable paths.
10. Continuous evidence, rollback, and deauthorization if behavior regresses.

This applies to Codex, Claude, Ollama expansion, Git/GitHub operations, BMAD work creation, Dev Console controls, command execution, source mutation, delivery actions, and future specialist agents.

## Git And GitHub Authority Ladder

| Level | Capability |
| --- | --- |
| 0 | Report repo status, dirty worktree, current branch, PR/CI status, stale worktrees |
| 1 | Read-only Git/GitHub checks |
| 2 | Local workspace/worktree creation and cleanup for approved tasks |
| 3 | Local commit preparation with diff and staged-file evidence |
| 4 | Human-approved push, PR creation, PR metadata update, review request |
| 5 | Policy-approved low-risk remote actions |
| 6 | Human-approved merge after checks/reviews pass |
| 7 | Policy-approved merge and cleanup for trusted paths |
| 8 | Full hygiene automation: stale branch cleanup, merged worktree cleanup, abandoned run cleanup, issue/story sync, evidence archival |

## Dev Console Requirements

The Dev Console is a core Epic 6 product goal.

Experience requirements:

- dark-mode first,
- responsive,
- visual and scannable,
- polished and approachable,
- non-developer language,
- icons, color, status chips, lane badges, timelines, and flow diagrams where useful,
- realtime updates without timed full-page refresh,
- subtle stale-data warning when disconnected,
- automatic VM startup/logon availability.

Default views should show:

- active work,
- candidate/proposed work,
- blocked work,
- attention needed,
- selected lane/tool,
- next action,
- priority/order,
- source: Bob, Chief of Staff, BMAD, Dev Console, system,
- Git/GitHub hygiene state,
- evidence and approval status.

## Technical Direction

Keep current stack for initial slices:

- Next/React/Tailwind dashboard,
- FastAPI supervisor backend,
- shared TypeScript/Python contracts,
- current supervisor event stream using SSE,
- existing work item, execution attempt, routing preview, worker registry, evidence export, recipe gate, and managed action concepts.

Improve progressively:

- add client-side live state fed by SSE,
- patch cards/counts/detail panels in place,
- reduce `router.refresh()` dependence,
- add icons/animations/timelines/flow views as needed,
- promote routing preview into orchestrator lane decisions,
- merge fake-worker orchestration with existing `ExecutionAttempt` lifecycle.

Do not start Epic 6 with a new backend or major frontend rewrite. Extract a dedicated orchestrator or Mission Control backend only if stable boundaries and real need justify it.

## Mature-Tool Decision

Epic 6 follows a mature/self-hosted-first posture:

- Pilot LangGraph once integration boundaries are clear enough for graph execution over real supervisor concepts.
- Keep existing Git worktree and GitHub CLI workspace protocol as the execution foundation.
- Keep Prefect as fallback if the work becomes more workflow-ops than agent-state graph.
- Defer Temporal, CrewAI, OpenHands, Dagger, n8n, Node-RED, Taskfile/just, and LiteLLM as orchestrator-core choices for initial integrated slices.
- Keep custom code limited to Kendall-specific policy, adapters, task packets, approvals, evidence, retention, fixtures, and Dev Console projections.

References:

- `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md`
- `docs/architecture/kendall-vnxt-orchestrator-mature-tool-comparison-2026-06-10.md`
- `docs/architecture/kendall-vnxt-orchestrator-spec-2026-06-10.md`
- `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md`
- `docs/goals/epic-6-progress-and-kickoff-2026-06-10.md`
- `_bmad/memory/knx/decisions/mature-tool-orchestrator-lane-architecture-2026-06-10.md`

## Epic Outcomes

- BMAD outputs can become Draft/Candidate work.
- Bob can approve Candidate work or use immediate mode.
- Active work enters existing supervisor contracts.
- Orchestrator lane decisions reuse/evolve routing preview.
- Execution attempts and evidence use existing supervisor models.
- Dev Console shows status, priority, selected lane, why that path, blockers, approvals, evidence, next actions, and Git/GitHub hygiene.
- Progressive authority gates control all automation.
- Git/GitHub delivery and cleanup become progressively automated.
- Dev Console launches with the VM and stays live without manual refresh.
- Future implementation agents can work from durable docs instead of chat memory.

## Epic Completion Definition

Epic 6 is complete when Kendall_vNxt has a full end-to-end product-development pipeline from idea/BMAD output through Dev Console, orchestration, implementation, verification, review, GitHub delivery, and cleanup, with each segment operating at the highest authority level it has safely earned.

Completion does not require every segment to be fully autonomous. It requires the full path to exist, to be visible in Dev Console, to preserve progressive authority controls, and to complete at least one real BMAD story through delivery and cleanup with human-approved gates where risk remains high.

Minimum completion path:

```text
BMAD real story
  -> Candidate Work
  -> approved or immediate Active Work
  -> orchestrated lane decision
  -> safe local/Ollama planning or checks
  -> bounded Codex implementation in isolated worktree with approval
  -> verification
  -> bounded Claude review when justified or explicitly approved
  -> GitHub PR/delivery with approval
  -> cleanup of local work artifacts
  -> Dev Console evidence and final done state
```

Stretch completion can add policy-approved autonomy for low-risk repeatable paths, including automatic Candidate promotion, GitHub delivery, merge, and cleanup, but only after staged evidence proves those authority levels.

## MVP And Stretch Boundary

Epic 6 MVP must complete:

- BMAD real story becomes Candidate Work.
- Candidate Work can be prioritized and promoted to Active.
- Active work routes through orchestrator using existing supervisor contracts.
- Dev Console shows realtime status, evidence, attention, selected lane, and next action.
- Safe local/Ollama checks run where approved.
- Codex performs bounded implementation in an isolated worktree with Bob approval.
- Verification runs and records evidence.
- Claude performs bounded review only when justified or explicitly approved.
- GitHub PR/delivery is prepared or performed with Bob approval.
- Local cleanup happens after completion.
- One real BMAD story reaches done through that path.

Epic 6 stretch may include:

- automatic Candidate promotion for low-risk work,
- policy-approved Codex implementation for low-risk stories,
- policy-triggered Claude review,
- automatic PR creation,
- automatic merge,
- remote branch cleanup,
- full GitHub issue/story status sync,
- trusted low-risk end-to-end autonomy.

## MVP Authority Targets

| MVP Segment | Target Authority |
| --- | --- |
| BMAD output -> Candidate Work | Automatic allowed |
| Candidate priority/order | Manual controls plus system recommendations |
| Candidate -> Active Work | Bob approval, plus explicit immediate mode |
| Orchestrated routing | Automatic lane decision and evidence |
| Safe local/Ollama checks | Automatic within approved endpoint/model/scope |
| Codex implementation | Human-approved, isolated worktree, bounded paths |
| Verification | Automatic after approved implementation |
| Claude review | Human-approved or policy-triggered for high risk, review-only |
| GitHub PR/delivery | Human-approved push/PR/delivery actions |
| Merge | Bob-approved only; may remain stretch if needed |
| Local cleanup | Automatic after done with evidence retained |
| Remote cleanup | Stretch |

## Long-Running Goal Execution Strategy

Epic 6 may be executed as one long-running goal that continues until the MVP completion path is done. That goal should not treat the epic as one unbounded implementation blob. It should run through internal milestone gates and verify each slice before advancing.

Recommended goal milestones:

1. Candidate Work foundation: Stories 6.3 through 6.6.
2. Orchestrated preview foundation: task packet v0, route decision, and execution-attempt integration.
3. Dev Console live pipeline: realtime state, Proposed/Active/Attention updates, and visual/non-technical UX.
4. Proof workflow: synthetic BMAD story, then real BMAD story through fake/blocked path.
5. Refactoring and maintenance foundation: identify duplicate prototype concepts, naming drift, stale code paths, brittle dashboard patterns, and cleanup tasks that block the integrated product direction.
6. Safe local execution: approved Ollama/local checks and deterministic utility checks.
7. Git hygiene foundation: read-only repo/worktree/branch/PR/CI visibility.
8. Local worktree management: approved local worktree creation/removal for Active work.
9. Codex authority: dry-run/read-only checks, then human-approved bounded implementation.
10. Claude authority: dry-run/read-only checks, then human-approved review-only use.
11. GitHub delivery: human-approved push/PR/delivery path.
12. Cleanup: automatic local cleanup after done with evidence retained.
13. MVP proof: one real BMAD story reaches done through delivery and cleanup.

Each milestone should end with:

- focused tests for that slice,
- updated story evidence,
- Dev Console visibility where applicable,
- authority-boundary checks,
- documentation/index updates when touched,
- full `pnpm.cmd run check` at integration boundaries or before declaring the milestone complete.

The long-running goal may continue autonomously across stories. When an authority level requires Bob approval, the blocked lane/task should pause and surface an approval request, but the goal should continue on other safe unblocked work when possible. Approval gates should block only the specific gated operation, not the entire epic, unless no meaningful safe work remains.

The goal must stop for Bob only when a test exposes unsafe behavior, scope expands beyond the approved MVP, no safe unblocked work remains, or a high-blast-radius operation such as real Codex launch, real Claude launch, GitHub remote write, merge, or risky cleanup is the next required step and cannot be bypassed by continuing other work.

Refactoring and maintenance tasks are part of the long-running goal when they reduce fragmentation, remove obsolete prototype seams, clarify naming, improve Dev Console usability, stabilize tests, or make the integrated pipeline safer. They should be created as Candidate or Active work with clear scope and verification, not performed as opportunistic repo-wide churn. Cleanup and refactoring must preserve existing useful behavior, migrate tests, and avoid deleting prototype code until replacement behavior is proven.

When the goal encounters churn or repeated failures caused by bugs, brittle tooling, misformatted commands, fragile scripts, unclear runbooks, flaky tests, Windows quoting issues, or other preventable workflow errors, it should address the root cause when safe and in scope. The goal should prefer durable fixes such as command helpers, clearer scripts, validation checks, test hardening, documentation updates, or safer defaults over repeatedly applying one-off workarounds.

Root-cause maintenance still follows the same guardrails:

- keep the change scoped,
- preserve useful behavior,
- add or update verification,
- avoid unrelated formatting/refactors,
- do not bypass authority gates,
- record the fix as evidence when it affects the development pipeline.

## Long-Running Goal Operating Rules

1. Milestone state file: keep a durable Epic 6 progress artifact with current milestone, completed stories, blocked authority gates, approvals needed, and next safe work.
2. Authority ledger: track which authorities are currently allowed, blocked, or approved for the run.
3. Decision log: record meaningful product and architecture decisions immediately.
4. Failure budget: if the same class of failure happens twice, treat it as root-cause maintenance rather than incidental churn.
5. Dev Console first: backend pipeline state should have a planned or implemented Dev Console projection before a milestone is complete.
6. No invisible automation: every automated action leaves evidence explaining what ran, why, authority level, summary inputs/outputs, result, and next step.
7. One source of truth: avoid parallel state models; Candidate Work, WorkItem, ExecutionAttempt, events, and evidence each need clear ownership.
8. Approval carryover: approvals are specific; generic continuation language does not approve new authority families.
9. User attention: interrupt Bob only for decisions, approvals, blockers, failed checks, scope expansion, scarce Claude use, or unsafe behavior.
10. PR size: split large diffs into reviewable PR-sized milestones even when the long-running goal continues.
11. Recovery: mutating automation stories must define resume, retry, rollback, or inspection behavior.
12. Evidence retention: retain metadata and links, not raw prompts, completions, reasoning traces, provider payloads, secrets, or unnecessary source copies.
13. Security/secrets: do not put secrets in logs, events, prompts, evidence exports, or dashboard displays.
14. Stop/continue: if one lane is blocked, continue safe work elsewhere; stop only when all safe work is blocked or the next unavoidable step needs approval.
15. Fresh VM: verify startup and environment assumptions as part of relevant milestones.

## MVP Data Model Direction

Active work should continue to use the existing `WorkItem` model and supervisor contracts.

Candidate Work should be added as a lightweight persisted proposal model for MVP. Candidate Work v0 should include:

- `id`
- `title`
- `requestedOutcome`
- `source`: `bmad`, `chief_of_staff`, `dev_console`, or `system`
- `sourceArtifactPath`
- `sourceArtifactType`: story, PRD, brief, research, or review
- `riskLevel`
- `priority`
- `status`: proposed, approved, rejected, or deferred
- `createdAt`
- `updatedAt`
- `approvedAt`
- `promotedWorkItemId`

Draft Work should stay in BMAD artifacts or Chief of Staff memory for MVP. It should not become a first-class supervisor backend model until real usage proves the need.

## Dev Console MVP Structure

MVP Dev Console should include or adapt these areas:

- Overview: counts, live activity, priority pressure, and high-level pipeline health.
- Proposed Work: Candidate Work review, priority/order, approve, reject, and defer.
- Active Work: current Active `WorkItem` pipeline.
- Attention: approvals, blockers, failed checks, stale work, scarcity issues, and Git/GitHub hygiene problems.
- Work Detail: route, attempts, evidence, BMAD source links, priority, approval history, checks, review, Git hygiene, and recovery path.
- Controls/Settings: authority ladder status, startup status, provider readiness, Git/GitHub readiness, and policy reports.

Avoid a separate Draft Work page for MVP. Draft Work remains in BMAD artifacts or Chief of Staff memory.

## Realtime MVP Scope

Realtime MVP must cover the operational pipeline:

- Overview counts.
- Proposed Work list and status.
- Active Work list and status.
- Attention count and list.
- Work item state changes.
- Execution attempt status.
- Route decision updates.
- Evidence summaries.
- Approval and blocker status.

These may remain snapshot/manual refresh initially:

- long-form reports,
- historical archives,
- static policy reports,
- documentation authority reports,
- maintenance/readiness reports,
- detailed GitHub delivery reports before delivery automation starts.

Technical MVP:

- initial snapshot fetch,
- SSE event stream,
- client-side live store,
- patch Candidate Work, WorkItems, attempts, events, route decisions, evidence summaries, and attention state in place,
- stale indicator on disconnect,
- no timed full-page refresh loop.

## BMAD Integration Contract

BMAD should produce a Candidate Work import package for MVP.

Fields:

- `title`
- `requestedOutcome`
- `sourceArtifactPath`
- `sourceArtifactType`
- `artifactTitle`
- `storyId`, if available
- `epicId`, if available
- `acceptanceCriteria` summary
- `riskLevel`
- `recommendedPriority`
- `verificationSummary`
- `allowedScope`, if known
- `notes`

Initial supported sources:

- `docs/stories/*.md`
- `docs/prds/*.md`
- `docs/product/*.md`
- `_bmad-output/planning-artifacts/**`

MVP should support local repo markdown artifacts first. It should not require perfect parsing of every BMAD artifact type. Start with explicit frontmatter/headings and fallback summaries.

## Git/GitHub MVP Scope

MVP must include:

- repo status visibility,
- dirty worktree detection,
- current branch and base branch visibility,
- worktree list/status,
- branch ownership per Active work item,
- PR link/status when available,
- CI/check status when available,
- local cleanup of completed worktrees after done,
- GitHub delivery actions only with Bob approval.

MVP should not include:

- automatic merge,
- automatic remote branch deletion,
- automatic issue/story status mutation,
- automatic PR creation without approval,
- broad GitHub write automation.

MVP authority levels:

- read-only Git/GitHub checks: automatic,
- local worktree creation/removal: approved or policy-bound to Active work,
- push/PR/delivery: Bob-approved,
- merge: Bob-approved or stretch,
- remote cleanup: stretch.

## Worker Authority Scope By MVP End

Ollama:

- automatic for approved local-safe planning, classification, summaries, route explanation, and low-cost checks,
- restricted to configured host endpoint/model allowlist,
- metadata-only retention.

Codex:

- may implement one real BMAD story by MVP end,
- requires Bob approval for launch,
- runs in isolated worktree,
- uses bounded path/scope,
- records changed files, verification commands, result, and cleanup status,
- does not perform autonomous merge.

Claude:

- review-only,
- scarce-use policy visible,
- human-approved unless a high-risk policy trigger is explicitly accepted,
- receives bounded diff/context rather than broad repo dump,
- performs no file edits.

GitHub:

- read-only status checks automatic,
- push/PR/delivery actions require Bob approval,
- merge is Bob-approved or stretch.

## MVP Verification Plan

Backend tests should cover:

- Candidate Work create/list/update/promote,
- BMAD import package parsing,
- Candidate -> Active `WorkItem` promotion,
- priority/order behavior,
- route decision creation,
- execution attempt integration,
- authority blocks,
- Ollama allowed/disallowed scope,
- Codex launch blocked without approval,
- Claude launch blocked without approval,
- Git/GitHub read-only hygiene fixtures,
- cleanup policy fixtures.

Frontend/browser tests should cover:

- Proposed Work view,
- approve/reject/defer Candidate Work,
- priority reorder,
- Active Work updates,
- Attention updates,
- Work Detail shows BMAD source, route, attempts, evidence, and Git hygiene,
- realtime SSE updates cards/counts without full page refresh,
- mobile/responsive Dev Console view.

End-to-end proofs should cover:

- synthetic BMAD story full fake/blocked path,
- real BMAD story full MVP path,
- VM startup launches supervisor backend and Dev Console.

Static/drift checks should cover:

- docs indexes,
- PRD/story/architecture alignment,
- authority checkpoint alignment,
- no raw prompt/completion retention,
- no unapproved process launch,
- no unapproved GitHub remote write.

## Cleanup And Recovery Policy

Automatic local cleanup after `done` is allowed when:

- the worktree was created by the system,
- the work item is `done`,
- required evidence export exists,
- no uncommitted changes remain or changes are confirmed safely preserved,
- cleanup records an event visible in Dev Console.

Manual approval is required for:

- deleting worktrees with uncommitted changes,
- deleting branches,
- deleting artifacts or evidence,
- deleting anything not created by the system,
- remote branch cleanup,
- GitHub issue or PR mutation.

Recovery behavior:

- failed implementation keeps the worktree,
- failed verification keeps the worktree,
- blocked cleanup appears in Attention,
- stale work receives recommended cleanup before automatic deletion,
- cleanup should be reversible or evidence-preserving where possible.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Epic becomes too large | Maintain MVP/stretch boundary and per-story authority levels |
| Duplicate state models | Use existing `WorkItem` and `ExecutionAttempt` where possible |
| Dev Console becomes too technical | Use non-developer language and visual design rules |
| Realtime gets fragile | Use SSE-first, initial snapshot plus patches, and stale warning |
| Codex/Claude overreach | Use progressive authority, isolated worktrees, and review-only Claude |
| Git/GitHub damage | Use read-only first, approved remote actions, and cleanup gates |
| BMAD floods pipeline | Use Draft/Candidate staging plus approval/immediate mode |
| Cleanup deletes useful work | Require evidence, preserve uncommitted changes, and gate risky deletion |
| Custom code grows too much | Keep mature-tool-first posture and extract only after boundaries prove need |
| Tests become slow or unwieldy | Use focused checks per story and full checks at integration boundaries |

## Story Map

MVP-critical sequence:

| Story | Purpose | Authority |
| --- | --- | --- |
| 6.1 Fake-worker orchestrator spike | Existing fake-worker lane selector, evidence records, blocked states, and scenario fixtures | Review; no real process launch |
| 6.2 Epic 6 product/architecture consolidation | Align brief, PRD, architecture, authority docs, and story map to integrated Dev Console/BMAD/orchestrator direction | Docs only |
| 6.3 Candidate Work model/API | Add lightweight Candidate Work persistence and API | No execution |
| 6.4 BMAD import package parser | Parse local BMAD/story markdown into Candidate Work import packages | No execution |
| 6.5 Proposed Work Dev Console view | Show Candidate Work in Dev Console with non-technical copy and source links | UI/read-only plus candidate actions |
| 6.6 Candidate priority/order/promote | Prioritize, reorder, approve, reject, defer, and promote Candidate Work to Active WorkItem | No worker launch |
| 6.7 Task packet v0 and orchestrated preview | Build minimal task packet and record orchestrator lane decision using existing routing preview concepts | Preview only |
| 6.8 ExecutionAttempt integration | Attach orchestrator decisions to existing execution attempts and evidence | Fake/blocked attempts only |
| 6.9 Dev Console realtime live state | SSE-backed client state updates cards, counts, detail panels, attempts, evidence, and attention without full refresh | UI/live read model |
| 6.10 Synthetic story proof | Synthetic BMAD story flows through BMAD -> Candidate -> Active -> orchestrated preview/fake attempt -> Dev Console evidence | Fake/blocked execution |
| 6.11 Real BMAD story proof | Repeat integrated flow with a real existing BMAD story | Fake/blocked execution |

MVP authority expansion sequence:

| Story | Purpose | Authority |
| --- | --- | --- |
| 6.12 Startup availability | Verify VM logon/startup launches supervisor backend and Dev Console reliably | Local startup only |
| 6.13 Safe local execution | Ollama and deterministic local checks handle approved safe tasks | Within approved local boundaries |
| 6.14 Git hygiene read-only | Dev Console shows repo/worktree/branch/PR/CI hygiene status | Read-only Git/GitHub |
| 6.15 Local worktree management | Create/remove isolated local worktrees for approved Active work | Local filesystem, no remote |
| 6.16 Codex dry-run/read-only checks | Verify Codex CLI availability/auth and bounded read-only behavior | No writes/process task execution until approved |
| 6.17 Bounded Codex implementation | Codex runs in isolated worktree with path scope, tests, evidence, and Bob approval | Human-approved execution |
| 6.18 Claude dry-run/read-only review | Verify Claude Code review-only invocation and scarcity controls | No writes |
| 6.19 Bounded Claude review | Claude performs bounded adversarial review for high-risk or explicitly approved work | Human-approved scarce lane |
| 6.20 GitHub delivery progression | Push/PR/check/review/merge capabilities progress through GitHub authority ladder | Progressive remote authority |
| 6.21 Automatic local cleanup | Completed/stale/abandoned local worktrees, tasks, and evidence are cleaned up under policy | Progressive local authority |

Stretch sequence:

| Story | Purpose | Authority |
| --- | --- | --- |
| 6.22 Remote cleanup and issue/story sync | Remote branch cleanup and GitHub issue/story status sync | Progressive remote authority |
| 6.23 Trusted low-risk autonomy | Low-risk repeatable workflows move end to end with Bob handling exceptions | Policy-approved semi-automation |

## Initial Proofs

First proof:

- Synthetic BMAD story: "Update Dev Console Label Copy."
- Use Candidate -> Active -> orchestrated preview/fake attempt.
- No real Codex/Claude launch.

Second proof:

- Select a real existing BMAD story from the repository.
- Prove actual story metadata, acceptance criteria, verification expectations, links, and docs indexes flow through the same path.

## Non-Approvals

This PRD does not approve:

- real Codex CLI implementation execution,
- real Claude Code review execution,
- hosted orchestration control planes,
- new OpenAI, Anthropic, GitHub Models, or cloud API billing,
- autonomous merge,
- branch protection bypass,
- raw prompt/completion/reasoning/provider payload retention,
- arbitrary shell execution,
- broad source mutation by workers,
- broad GitHub remote operations.

These may be unlocked only through explicit successor stories and progressive authority evidence.

## Verification Expectations

Every Epic 6 implementation story must include focused verification for its authority level.

Required patterns:

- deterministic tests for lane/work-order decisions,
- tests proving fake/blocked workers do not launch real processes,
- metadata-only retention tests,
- blocked-state tests for unavailable or unauthorized lanes,
- Dev Console projection tests when UI state changes,
- Git/GitHub hygiene tests for workflow operations,
- documentation index and authority checkpoint alignment,
- focused supervisor tests,
- full `pnpm.cmd run check` when shared contracts, docs drift checks, or cross-package behavior are touched.
