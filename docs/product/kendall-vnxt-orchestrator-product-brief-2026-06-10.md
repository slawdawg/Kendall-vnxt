---
title: Kendall_vNxt Orchestrator Product Brief
status: draft
created: 2026-06-10
updated: 2026-06-10
---

# Kendall_vNxt Orchestrator Product Brief

## Product Idea

Kendall_vNxt should become an integrated product-development system where Bob can turn an idea into researched, structured, prioritized, implemented, reviewed, delivered, and cleaned-up work with progressively increasing automation.

The important shift is from "LLM router" to "task orchestrator." A router decides which model receives a prompt. The orchestrator decides what work needs doing, which lane, tool, or agent should handle it, what authority applies, what evidence is required, when to escalate, when to stop for Bob, and how the result appears in the Dev Console.

## North Star

Bob has an idea. BMAD-method workflows and skills help develop, expand, research, and structure it. The completed product work enters the Dev Console pipeline. The system prioritizes, decomposes, routes, implements, verifies, reviews, delivers, and cleans up. Bob is pulled in for meaningful decisions, approvals, exceptions, and review checkpoints.

North-star flow:

```text
Idea
  -> BMAD product development
  -> Draft or Candidate Work
  -> Active Dev Console Work Item
  -> Orchestrated Execution
  -> GitHub delivery
  -> cleanup
```

The long-term goal is autonomous end-to-end handling for trusted low-risk workflows. That autonomy must be earned progressively through evidence, tests, safe defaults, clear Dev Console visibility, rollback behavior, and deauthorization when behavior regresses.

Epic 6 may pursue the full end-to-end path if each segment advances progressively. The target is not partial pipeline theater; the target is a real path from BMAD output through delivery and cleanup. High-blast-radius stages such as Codex implementation, Claude review, GitHub remote operations, merge, and cleanup may remain human-approved until they earn greater authority.

Epic 6 MVP should prove one real BMAD story can move from Candidate Work to Active Dev Console work, through orchestrated routing, safe local/Ollama checks, bounded Codex implementation with approval, verification, bounded Claude review when justified, GitHub delivery with approval, local cleanup, and final Dev Console evidence. Stretch autonomy can add automatic Candidate promotion, low-risk Codex execution, policy-triggered Claude review, automatic PR creation, automatic merge, remote cleanup, and trusted low-risk end-to-end autonomy after MVP evidence is stable.

## Product Surfaces

### Chief Of Staff

The Chief of Staff is Bob's broad executive-assistant front door. It can receive broad requests, clarify intent, split work into jobs, and delegate to specialist agents or resources. It is not limited to software work.

### Dev Console

The Dev Console is Bob's development pipeline window. Any software-development work, including work started through Chief of Staff or BMAD, should become visible here when it is Candidate or Active work.

The user-facing dashboard should move from "Supervisor" language toward "Dev Console." The internal `supervisor` service name can remain for now to avoid unnecessary churn.

### Orchestrator

The orchestrator is shared dispatch/control infrastructure behind Chief of Staff, BMAD intake, and Dev Console. It routes work to lanes, tools, specialist agents, or blocked/approval states. It is not the conversational personality and not merely a model selector.

### Supervisor Service

The current supervisor backend remains the control and persistence service for Epic 6. It already owns work items, workflow states, events, execution attempts, routing preview, evidence export, worker registry, gates, and dashboard APIs. Epic 6 should introduce cleaner internal boundaries before considering a separate orchestrator or Mission Control backend.

## Work Creation

Work should move through a staged model:

1. Draft Work: rough idea, request, BMAD output, or Chief of Staff finding that is not yet structured enough to enter the development pipeline.
2. Candidate Work: structured proposed work that can be reviewed in or near the Dev Console, optionally preview-routed, but not executed.
3. Active Dev Console Work Item: approved work or explicit immediate-mode work that enters the supervisor/orchestrator pipeline.
4. Orchestrated Execution: active work is routed, attempted, evidenced, blocked, reviewed, delivered, or completed.

BMAD and Chief of Staff may create Draft or Candidate work automatically. Active work requires Bob approval or explicit immediate mode. Immediate mode skips candidate approval, but it does not skip execution-authority gates.

## BMAD-Method Role

BMAD-method is part of the product system. It remains the structured planning and elicitation layer for briefs, PRDs, architecture docs, stories, research, reviews, and other planning artifacts.

The orchestrator should consume BMAD outputs as task inputs and context. It should not replace BMAD's planning workflows.

Default behavior:

- BMAD outputs candidate Dev Console work items.
- Bob reviews, edits, approves, rejects, batches, or prioritizes them.

Override behavior:

- Bob can explicitly authorize BMAD outputs to create Active work and begin routing immediately.
- Execution authority gates still apply.

## Lanes And Resource Policy

Current resource preference:

1. Ollama first for cheap local-safe reasoning, classification, summaries, draft planning, and low-cost validation.
2. Codex CLI for implementation and high-performance software work.
3. Claude Code CLI sparingly for adversarial review, flaw-finding, high-risk changes, and checks on Codex output.
4. GitHub Pro/GitHub CLI as workflow rails, not the orchestration brain.

The orchestrator routes work, not just prompts. A single user request may split into calendar work, research work, BMAD planning work, software implementation work, review work, and GitHub workflow work.

## Progressive Authority

All automation should earn authority progressively. This applies to Codex, Claude, Ollama, GitHub operations, BMAD work creation, Dev Console controls, command execution, source mutation, delivery actions, and future specialist agents.

General ladder:

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

Codex and Claude should not be permanently hard-blocked. They should start strict, then soften only after staged tests prove trustworthy behavior, bounded execution, safe retention, correct approvals, budget/scarcity respect, and Dev Console evidence.

## Dev Console Experience

The Dev Console should be visual, polished, dark-mode first, responsive, realtime, and approachable for a non-developer operator. It should avoid developer-heavy jargon and translate internal concepts into understandable language.

Examples:

- `execution attempt` -> "Run"
- `blocked authority` -> "Needs approval"
- `selected lane` -> "Assigned to"
- `routing decision` -> "Why this path"
- `verification failed` -> "Checks failed"
- `awaiting_audit` -> "Waiting for review"
- `needs_rework` -> "Needs fixes"

The Dev Console should use icons, color, status chips, lane badges, timelines, flow diagrams, and smooth animation where they improve comprehension. It should clearly show what is active, blocked, waiting, approved, failed, risky, local, external, cheap, scarce, or done.

Default visibility:

- Overview and Active Work show concise status, next action, lane/tool, owner, age, source, priority, and attention state.
- Work detail shows task packet summary, BMAD artifact links, route decision, selected/rejected lanes, execution attempts, evidence, approval history, checks, review state, and recovery path.
- Attention view shows blocked authority, waiting approval, failed checks, scope expansion, conflicting review, unavailable lanes, budget/scarcity issues, stale work, and Git/GitHub hygiene issues.

## Realtime And Startup

The current Next/React/Tailwind dashboard and FastAPI supervisor backend are adequate for initial Epic 6 work. The backend already exposes server-sent events, and the dashboard already has a basic live feed.

Next technical direction:

- keep SSE as the first realtime transport,
- load an initial authoritative snapshot,
- patch local Dev Console state from streamed events,
- update cards, counts, detail panels, attempts, evidence, and attention indicators in place,
- avoid timed full-page refresh loops,
- show a subtle stale-data warning when realtime disconnects.

The Dev Console and supervisor backend should launch automatically as part of the VM startup/logon experience. Startup automation is part of the product experience, not an operator afterthought.

## Priority And Work Order

Bob should be able to manually prioritize, reorder, pause, defer, pin, or promote Draft, Candidate, and Active work.

The system should also recommend or automatically adjust work order when dependencies, blockers, risk, urgency, resource scarcity, failed checks, stale branches, or GitHub/CI state make a different sequence safer or more efficient.

Automatic reordering must be visible and explainable.

## Git And GitHub Hygiene

Git and GitHub workflow hygiene are first-class orchestration concerns. The system should account for:

- clean working tree,
- isolated worktree per implementation,
- branch ownership and naming,
- base branch freshness,
- issue/story links,
- PR readiness,
- CI status,
- branch protection,
- review requirements,
- merge readiness,
- stale branch/worktree cleanup,
- completed work cleanup,
- abandoned or failed work recovery.

Git/GitHub operations follow the same progressive authority ladder:

1. report only,
2. local read-only checks,
3. local workspace/worktree management,
4. local commit preparation,
5. human-approved push/PR actions,
6. policy-approved low-risk remote actions,
7. human-approved merge,
8. policy-approved merge and cleanup,
9. full hygiene automation.

## Mature-Tool Posture

Bob prefers self-hosted mature tooling before custom runtime code.

Current direction:

- Pilot LangGraph for orchestration core once integration boundaries are clear.
- Keep existing Git worktree and GitHub CLI workspace protocol as execution foundation.
- Keep Prefect as fallback if the problem becomes workflow-ops rather than agent-state graph.
- Defer hosted gateways and generic LLM routers until multiple API-callable providers justify them.
- Keep custom code narrow: Kendall-specific policy, task packet contracts, adapters, approvals, evidence, retention, and tests.

## First Proofs

First proof:

- Synthetic BMAD story: "Update Dev Console Label Copy."
- Goal: work out BMAD-to-Dev-Console-to-orchestrator integration without risking real backlog confusion.
- No real Codex/Claude process launch.

Second proof:

- Use a real existing BMAD story from the repository.
- Goal: prove actual story metadata, acceptance criteria, verification expectations, links, and indexes flow through the pipeline.

## Success Signals

- BMAD output can become Candidate work.
- Bob can approve or immediate-mode Candidate work into Active Dev Console work.
- Existing supervisor contracts store the work.
- Orchestrator decisions reuse/evolve routing preview rather than duplicating it.
- Execution attempts and evidence use existing supervisor concepts.
- Dev Console shows selected lane, why that path, active status, blockers, approvals, evidence, and next action.
- Automation authority increases only after staged evidence proves safe behavior.
- Git/GitHub hygiene is visible and progressively automated.
- Dev Console launches with the VM and stays live without manual refresh.
- Future work can be implemented from durable docs rather than chat memory.

## Non-Goals For Initial Slices

- Hosted orchestration control plane.
- Replacing the supervisor backend before boundaries prove the need.
- Broad frontend/backend framework rewrite.
- Real Codex/Claude process launch without progressive authority evidence and explicit approval.
- Autonomous merge before GitHub delivery gates are proven.
- Raw prompt/completion/reasoning/provider payload retention.
- Broad source mutation outside isolated approved scope.
