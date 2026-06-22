# Architecture Index

Date: 2026-06-08
Status: current navigation index

## Current Spine

- `kendall-vnxt-overall-architecture.md`: durable system architecture spine.
- `kendall-vnxt-current-gap-review-2026-06-08.md`: current gap review and recommended next work.
- `kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`: code-aware implementation reconciliation.
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

## Older Gap Review

- `kendall-vnxt-architecture-gap-review-2026-06-08.md`: older architecture gap snapshot retained for history.

## Current Authority Status

All real execution authority remains disabled unless an explicit approval checkpoint says otherwise:

- local provider/model calls disabled,
- subscription-agent process launch disabled,
- premium execution disabled,
- arbitrary shell execution disabled,
- worker source mutation disabled,
- worker network access disabled,
- worker credential access disabled.
