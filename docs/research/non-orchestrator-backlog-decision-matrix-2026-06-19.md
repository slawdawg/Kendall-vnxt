---
date: 2026-06-19
status: decision research
topic: non-orchestrator backlog prioritization
input_documents:
  - docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
  - docs/workflows/workspace-coordination-report.md
  - docs/research/standard-worktree-workflow-tooling-recommendation-2026-06-18.md
---

# Non-Orchestrator Backlog Decision Matrix

## Executive Summary

The research/brainstorming lane should promote a small number of backlog items
instead of turning all ten handoff threads into implementation work.

Recommended near-term order:

1. Developer Readiness Dashboard research packet.
2. BMAD Workflow Compression decision packet.
3. CI Speed And Signal / Supervisor Test Performance profiling spike.

The first item is the strongest product-value candidate because it can connect
existing readiness, worktree, PR/CI, and next-action evidence into one operator
view. It is also blocked on read-only worktree visibility foundation. Do not
promote dashboard implementation, and do not treat a mini-PRD as implementation
approval, until that foundation is shaped.

The second item is the highest leverage governance item because it can reduce
process friction across every future lane. It should be handled carefully: the
output should define thresholds and examples, not weaken safety or evidence
requirements for work that touches execution, approvals, provider calls,
cleanup, or GitHub delivery.

## Ranking Criteria

| Criterion | Meaning |
| --- | --- |
| Value | Expected impact on Bob's day-to-day project flow or Kendall_Nxt product direction. |
| Effort | Relative implementation or research cost. |
| Risk | Chance of causing governance ambiguity, brittle tooling, scope creep, or safety regression. |
| Dependency | Whether another lane or decision should land first. |
| Promotion path | Best next artifact: PRD, mini-PRD, story, research packet, or spike. |

Scores use `High`, `Medium`, or `Low`. Lower effort and lower risk are better.

## Decision Matrix

| Rank | Backlog Item | Value | Effort | Risk | Dependency | Promotion Path | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Developer Readiness Dashboard | High | Medium | Medium | Read-only worktree visibility foundation | Mini-PRD | Top candidate; blocked on visibility foundation. |
| 2 | BMAD Workflow Compression | High | Medium | High | Governance agreement | Experimental decision packet, then mini-PRD if rules change | Define thresholds and examples before changing process. |
| 3 | CI Speed And Signal | High | Medium | Low | Current CI timing evidence | Story or profiling spike | Profile first; split fast/slow only with evidence. |
| 4 | Supervisor Test Performance | Medium | Low | Low | Same as CI speed | Story or profiling spike | Pair with CI speed; avoid duplicating work. |
| 5 | Workspace UX Polish | Medium | Low | Medium | Local skill durability decision | Story | Improve docs/wrappers after deciding repo-owned vs personal skill support. |
| 6 | PR Policy And Lane Governance | Medium | Medium | High | BMAD workflow compression | Mini-PRD or decision packet | Fold into BMAD compression unless it becomes formal delivery policy. |
| 7 | Local Dev One-Command Experience | Medium | Low | Medium | `mise` workflow already merged | Story | Defer until Bob has used `mise` workflow enough to identify real gaps. |
| 8 | Runtime Evidence Quality | High | High | High | Product/governance scope decision | PRD | Important, but too broad for the next immediate lane. |
| 9 | Codex Skills Library | Medium | Medium | Medium | Skill distribution decision | Research packet, then story | Useful, but should follow workspace UX and governance thresholds. |
| 10 | Next Product Value Lane | High | High | High | Product direction choice | PRD | Keep as framing; do not start until smaller candidates clarify direction. |

## Recommended Next Artifacts

### 1. Developer Readiness Dashboard Research Packet

Purpose: define the smallest useful operator view that answers:

- What worktree am I in?
- Is local readiness green?
- What PR/CI state matters?
- What is the next safe action?
- What evidence backs that recommendation?

Boundaries:

- Do not implement inside the orchestrated worktree visibility branch.
- Do not require provider calls, paid usage, worker launch, Graphify, or
  credential/session access.
- Treat current worktree visibility work as an upstream dependency, not a place
  to smuggle dashboard scope.

Likely output: mini-PRD or product brief after the research packet.

### 2. BMAD Workflow Compression Decision Packet

Purpose: reduce ceremony for small changes while preserving safety.

The decision packet should define thresholds for:

- no formal BMAD artifact;
- story-only work;
- mini-PRD;
- full PRD/architecture;
- required review/evidence packet;
- party-mode or multi-agent review.

Non-negotiables:

- Keep explicit approval gates for execution, provider calls, source mutation,
  GitHub delivery, cleanup, secrets, retention, and worker/process launch.
- Keep evidence for automated actions.
- Keep formal BMAD flow for product behavior changes, governance changes, and
  cross-boundary implementation.

Likely output: decision packet first; mini-PRD only if governance rules change.

### 3. CI Speed / Supervisor Test Profiling Spike

Purpose: identify actual slow checks before splitting or rewriting CI.

First evidence to collect:

- current GitHub CI timing by job;
- local `mise run check` timing;
- supervisor test profile output;
- slowest tests and whether they are unit, integration, fixture-heavy, or
  environment-sensitive.

Likely output: story if profiling reveals obvious low-risk fixes.

## Deferrals

Runtime Evidence Quality and Next Product Value Lane are high-value but too
broad to start immediately from this handoff. They should become PRD candidates
after the readiness dashboard and governance compression work clarify what Bob
needs to see, decide, and trust.

Codex Skills Library should not become a repo-distributed skill system until
there is a decision on personal-vs-repo skill ownership. In the near term, use
the existing personal `kendall-workspace` skill and document any gaps it reveals.

## Recommended Immediate Next Step

Create a Developer Readiness Dashboard research packet in this lane. Keep it
strictly read-only and product-facing, with implementation deferred until the
orchestrated worktree visibility foundation is available.
