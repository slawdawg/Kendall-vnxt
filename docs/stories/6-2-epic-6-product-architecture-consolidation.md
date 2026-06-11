# Story 6.2: Epic 6 Product And Architecture Consolidation

Date: 2026-06-10
Status: done

## Story

As Bob,
I want the orchestrator epic, Dev Console direction, BMAD intake model, progressive authority ladder, and Git/GitHub hygiene plan consolidated into durable product and architecture artifacts,
so that future implementation stories tie the existing Kendall_vNxt systems together instead of adding another standalone prototype.

## Context

Story 6.1 proved fake-worker orchestrator scenarios, deterministic lane selection, metadata-only evidence, and blocked real CLI launch behavior.

The interactive BMAD product brief expanded the target product shape:

- Chief of Staff is Bob's broad front door.
- Dev Console is Bob's software pipeline window.
- BMAD-method is a first-class source of Draft and Candidate work.
- Work moves through Draft Work -> Candidate Work -> Active Dev Console Work Item -> Orchestrated Execution.
- Orchestrator routes work to lanes, tools, agents, or blocked/approval states.
- Existing supervisor contracts remain the control/persistence foundation.
- Dev Console integration is a core Epic 6 goal.
- Progressive authority applies to all automation.
- Git/GitHub hygiene is part of orchestration.
- North star is idea -> BMAD -> Dev Console pipeline -> delivery -> cleanup.

## Acceptance Criteria

1. Product brief reflects the interactive BMAD decisions for Chief of Staff, Dev Console, BMAD intake, orchestrator role, progressive authority, Dev Console UX, priority/order, Git/GitHub hygiene, and north-star workflow.
2. Epic 6 PRD reflects the integrated product direction and no longer frames Epic 6 as only a standalone LLM-routing or fake-worker spike.
3. Epic 6 story map includes progressive slices for BMAD intake, Candidate Work, Dev Console integration, orchestrated preview, execution attempts, realtime state, synthetic proof, real-story proof, safe local execution, Git hygiene, Codex/Claude authority softening, GitHub delivery, cleanup, and trusted autonomy.
4. Documentation preserves the current non-approvals for real Codex launch, real Claude launch, broad source mutation, broad GitHub remote operations, autonomous merge, and raw prompt/completion retention.
5. Dev Console startup/logon availability is recorded as a product and implementation requirement.
6. The story index links this draft consolidation story.

## Non-Goals

- No real Codex CLI process launch.
- No real Claude Code process launch.
- No new hosted orchestration service.
- No new billing/provider account.
- No GitHub remote mutation.
- No autonomous merge.
- No source mutation beyond documentation changes.

## Verification

- `node .\scripts\check-doc-indexes.mjs` - passed.
- `pnpm.cmd run check` - passed; includes documentation drift checks, dashboard production build, and 115 supervisor tests.

## Implementation Notes

- Updated `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md` with the interactive BMAD product direction.
- Updated `docs/prds/kendall-vnxt-orchestrator-epic-6.md` with completion definition, MVP/stretch boundary, MVP authority targets, data model direction, Dev Console structure, realtime scope, BMAD integration contract, Git/GitHub scope, worker authority scope, verification plan, cleanup/recovery policy, risk mitigations, and sequenced story map.
- Updated `docs/architecture/kendall-vnxt-orchestrator-spec-2026-06-10.md` with BMAD, Dev Console, supervisor service, progressive authority, realtime, priority/order, and Git/GitHub hygiene integration.
- Added this Story 6.2 consolidation record and linked it from `docs/stories/index.md`.
- Preserved non-approvals for real Codex launch, real Claude launch, broad source mutation, broad GitHub remote operations, autonomous merge, and raw prompt/completion retention.
