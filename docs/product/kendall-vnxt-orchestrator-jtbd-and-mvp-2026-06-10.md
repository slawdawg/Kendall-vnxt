# Kendall_vNxt Orchestrator JTBD And MVP

Date: 2026-06-10
Status: draft product framing

Primary product brief:

- `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md`

## Product Reframe

The original research question was "how should Kendall route LLM work to conserve resources?"

The discovered product shape is broader: Kendall_vNxt needs a task orchestrator, not a classic LLM router.

A router decides which model endpoint receives a prompt.

An orchestrator decides what work needs doing, which execution lane should do it, what constraints apply, what evidence is required, and when the operator must make a decision.

## Job To Be Done

When the operator has development work to move forward, they want Kendall_vNxt to classify the work, spend the cheapest suitable resource first, escalate to stronger coding workers when needed, request independent review for risky changes, and leave an auditable trail so they can resume, approve, or reject progress without reconstructing context.

## Primary User Outcomes

- Conserve expensive or scarce assistant usage by using Ollama for cheap preparation and validation.
- Use Codex CLI for the work where high implementation performance matters.
- Use Claude Code CLI sparingly for adversarial review and flaw finding.
- Reduce the operator's coordination burden across worktrees, PRs, reviews, and handoffs.
- Preserve explicit approval gates for risky work, spending, file mutation, and merge paths.
- Produce durable evidence: why a lane was selected, what changed, what passed, what failed, and what needs the operator.

## MVP Workflow

First narrow workflow: issue-to-PR implementation loop.

1. The operator creates or selects a task.
2. Orchestrator classifies the task by type, risk, scope, cost, and required review depth.
3. Orchestrator uses Ollama for cheap planning, summarization, or validation when safe.
4. Orchestrator dispatches implementation work to a Codex CLI worker in an isolated worktree when code edits are required.
5. Orchestrator requests Claude Code CLI adversarial review only when risk or review policy justifies scarce usage.
6. Orchestrator runs the required verification commands.
7. Orchestrator opens or updates a PR only when the implementation and verification evidence meet policy.
8. Orchestrator reports status, blockers, changed files, verification results, and review findings.

## Lane Roles

| Lane | Role | Primary Use | Avoid |
| --- | --- | --- | --- |
| Ollama API | Economy reasoning | classification, summaries, draft plans, cheap validation, local-safe explanations | repo mutation, high-risk final decisions, secrets |
| Codex CLI | Implementation worker | coding, debugging, tests, repo-wide reasoning, PR-ready changes | adversarial review of its own output as the only review |
| Claude Code CLI | Scarce review worker | independent critique, security review, edge-case review, high-risk PR review | routine generation, broad implementation, low-value tasks |
| GitHub Pro | Workflow rails | issues, PRs, branch protection, Actions, review gates, history | primary orchestration logic |

## Decision Rights

The orchestrator may decide without the operator:

- classify task type and risk from metadata
- use Ollama for approved local-safe reasoning
- create a local job record
- propose a lane
- run read-only checks
- collect status and verification metadata

The orchestrator requires operator approval before:

- enabling a new provider or model lane
- spending scarce Claude review budget beyond policy
- spawning repo-mutating CLI workers if not already approved for the task class
- broadening file scope beyond the task
- merging or bypassing review gates
- retaining raw prompt/completion/provider payloads

## Out Of Scope

- General autonomous agent marketplace.
- Hosted model routing gateway as the first implementation.
- Autonomous merge to protected branches.
- Raw prompt or completion storage.
- Arbitrary provider/model selection.
- Claude as a routine implementation lane.
- GitHub Actions as the routine orchestrator brain.

## MVP Success Metrics

- Correct lane selected for scripted scenarios.
- Every lane decision includes reason codes.
- Ollama handles cheap prep without invoking Codex.
- Codex worker jobs produce isolated diffs and verification results.
- Claude review is requested only for configured high-risk scenarios.
- Worker failure produces a clean blocked state, not corrupted repo state.
- The operator can resume from the latest job record without chat memory.

## Open Product Questions

- Should the operator start orchestrator work from GitHub Issues, chat commands, or both?
- Which task classes are approved for Codex CLI mutation?
- Should Claude Code be review-only by policy, or can the operator approve edit mode case-by-case?
- What monthly or weekly scarce-use budget should Claude review enforce?
- What is the first PR workflow: local-only PR creation, GitHub issue comment, or dashboard surface?
