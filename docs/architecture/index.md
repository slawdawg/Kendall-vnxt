# Architecture Index

Date: 2026-08-13
Status: current navigation index

## Current Spine

- `kendall-vnxt-overall-architecture.md`: durable system architecture spine.
- `adr-current-product-slice-and-authority.md`: accepted ownership, authority,
  evidence, and correction-order decision for the current product slice.
- `kendall-vnxt-holistic-cleanup-program-2026-08-13.md`: current phased program
  for lifecycle convergence, technical-debt retirement, refactoring, and
  documentation/verification simplification. It carries the accepted standing
  cleanup mandate but changes no runtime authority.
- `kendall-vnxt-phase-2-lifecycle-convergence-contract-2026-08-17.md`: active
  Phase 2 supervisor-owned lifecycle contract, compatibility-boundary
  inventory, consumer migration constraints, and convergence exit gates.
- `kendall-vnxt-orchestration-boundary-decision-2026-08-16.md`: current Phase 1
  no-adoption decision and the supervisor-owned lifecycle-evidence / governed
  workspace-outcome contract boundary for any future engine evaluation.
- `kendall-vnxt-cleanup-phase-0-inventory-2026-08-13.md`: active baseline and
  ordered execution queue for the cleanup program.
- `manager-supervisor-source-intake-boundary.md`: capability-gated loopback-only handoff from one eligible source-backed manager seed through continuous dry-run/apply into the supervisor-owned authoritative WorkPacket lifecycle.
- `manager-supervisor-terminal-event-sync-boundary.md`: explicit loopback-only manager terminal-event persistence boundary that keeps refill planning network-free.
- `manager-lane-clarity-projection-boundary.md`: metadata-only Lane Clarity contract, normal-cycle loopback-only typed handoff receipt, recovery, and fail-closed nullable production carrier.
- `../workflows/manager-terminal-event-dogfood.md`: one-command local dogfood proof for fresh refill metadata and explicit terminal-event loopback sync.
- `kendall-vnxt-authority-dependency-graph-2026-06-08.md`: dependency graph for deferred execution authority.

## Execution Authority Boundaries

- `kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`: approval language required before blocked authority stories can move to ready.
- `kendall-vnxt-epic-6-authority-ledger-2026-06-10.md`: authority ledger for the long-running Epic 6 goal, including async approvals and current authority levels.
- `kendall-vnxt-execution-authority-approval-packet-2026-06-09.md`: explicit operator approval choices for blocked Ollama and subscription-agent authority stories.
- `kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md`: provider enablement, attempt reporting, and outcome evidence policy.
- `kendall-vnxt-worker-threat-boundary-2026-06-08.md`: command, prompt, provider, network, credential, and artifact safety boundary.
- `kendall-vnxt-dashboard-command-boundary-2026-06-08.md`: dashboard read, command, approval, and execution-prohibited surfaces.
- `kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md`: queue lease versus execution attempt boundary and provider no-call proofs.

## Provider And Launch Planning

- `kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md`: current LLM orchestration lane model for Ollama API, Codex CLI workers, Claude Code CLI review workers, and GitHub workflow rails.
- `kendall-vnxt-orchestrator-spec-2026-06-10.md`: draft orchestrator specification with lane contracts, job states, failure handling, and MVP acceptance criteria.
- `kendall-vnxt-orchestrator-runner-assignment-2026-06-21.md`: runner assignment extension for dispatchable lanes, ownership leases, heartbeats, takeover gates, and Dev Console assignment visibility.
- `kendall-vnxt-orchestrator-mature-tool-comparison-2026-06-10.md`: mature/self-hosted tool comparison for orchestrator implementation, recommending a LangGraph fake-worker pilot and Prefect fallback before custom runtime code.
- `kendall-vnxt-provider-disabled-fixtures-2026-06-08.md`: disabled provider fixture policy for Ollama, LM Studio, vLLM, and llama.cpp.
- `kendall-vnxt-process-lifecycle-design-2026-06-08.md`: future subscription-agent process lifecycle design.

## Historical Planning And Gap Reviews

- `kendall-vnxt-current-gap-review-2026-06-08.md`: dated gap review retained
  as historical planning evidence; it does not override the current cleanup
  program or accepted ADRs.
- `kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`: dated,
  code-aware reconciliation retained for history.
- `kendall-vnxt-architecture-gap-review-2026-06-08.md`: older architecture-gap
  snapshot retained for history.

## Proposed / Blocked

- `adr-proposed-epic-25-trusted-observer-and-issuer-topology.md`: approved only for the default-disabled, non-production `integrated_local` source slice after readiness gates; trusted attestation service topology selected, while live/bounded-live/production operation remains held.
- `adr-staged-epic-delivery-pilot.md`: provisional opt-in `epic-batch` contract; `standard-delivery` remains the default and no implementation behavior is authorized.

## Current Authority Status

All real execution authority remains disabled unless an explicit approval checkpoint says otherwise:

- local provider/model calls disabled,
- subscription-agent process launch disabled,
- premium execution disabled,
- arbitrary shell execution disabled,
- worker source mutation disabled,
- worker network access disabled,
- worker credential access disabled.
