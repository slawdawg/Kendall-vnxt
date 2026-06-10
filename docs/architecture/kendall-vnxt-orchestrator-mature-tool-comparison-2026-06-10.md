# Kendall_vNxt Orchestrator Mature Tool Comparison

Date: 2026-06-10
Status: decision support

## Decision Question

Before writing custom Kendall_vNxt orchestrator runtime code, which mature/self-hosted tools should be considered for job state, lane orchestration, retries, human checkpoints, worker execution, and verification?

## Required Fit

The tool or workflow must support the current lane model:

- Ollama API lane for cheap local reasoning.
- Codex CLI worker lane for implementation jobs.
- Claude Code CLI worker lane for scarce adversarial review.
- GitHub workflow rails for Issues, PRs, checks, and branch protections.

It must also preserve:

- local/self-hosted first posture
- metadata-only retention
- explicit approval gates
- fake-worker-first testing
- no real Codex/Claude process launch until approved
- no hosted control plane as a requirement

## Options Compared

| Option | Strength | Weakness | Recommendation |
| --- | --- | --- | --- |
| Existing Git worktree + GitHub CLI workspace protocol | Already proven locally; simple; matches current repo workflow | Needs job state and lane policy glue | Keep as foundation |
| LangGraph | Python orchestration runtime with persistence, human-in-the-loop, durable-ish checkpoints, graph state | Adds dependency; not a full external process supervisor; LangSmith is optional but should stay off by default | Pilot as orchestrator core |
| Prefect | Python workflow engine with states, retries, server, workers, artifacts, local/self-hosted modes | Data-pipeline orientation; less agent/lane semantic fit than LangGraph | Keep as fallback if workflow ops matter more than agent graph |
| Temporal | Strong durable execution and retry model; self-hostable | Operationally heavy for a local VM spike; service dependency | Defer until reliability needs exceed local state |
| Dagger | Mature local/CI build-test automation | Not a job/lane orchestrator | Consider later for portable verification pipelines |
| Taskfile / just | Lightweight local command runners; cross-platform options | No state machine, approvals, retries, or worker lifecycle | Use for developer commands, not orchestration core |
| CrewAI | Agent and flow abstraction with human feedback support | Encourages autonomous role-based agent systems; higher dependency and autonomy risk | Defer for now |
| OpenHands | Software-agent platform/SDK with local/cloud execution and tools | Could replace rather than orchestrate Codex/Claude lanes; large security surface | Defer unless replacing CLI worker strategy |
| n8n / Node-RED | Self-hosted/low-code workflow automation | Poor fit for repo mutation, strict source boundaries, test-first engineering workflow | Reject for orchestrator core |
| LiteLLM | Mature LLM gateway/router | Only useful for multiple API-callable model providers | Defer until more API lanes exist |
| AutoGen / Microsoft Agent Framework | Multi-agent patterns; Microsoft-backed direction | AutoGen maintenance transition and successor path require separate review | Defer pending Microsoft Agent Framework review |

## Recommended Path

Pilot **LangGraph** as the mature orchestration core for the spike, with fake workers only.

Why:

- It is Python-native and fits the supervisor stack.
- It models explicit graph state and transitions.
- It supports checkpoint persistence and human-in-the-loop patterns.
- It can keep Kendall's lane policy as explicit nodes/edges.
- It does not require a hosted service for the local spike.

Fallback:

- If LangGraph adds too much agent-framework weight or does not fit process-worker orchestration cleanly, use the existing Git worktree/GitHub CLI workspace protocol plus a minimal local job-state table.
- If the main need becomes operational workflow monitoring and retries rather than agent graph control, evaluate Prefect as fallback.

Deferred:

- Temporal for heavier durability.
- Dagger for verification pipelines.
- LiteLLM for future multi-API-provider routing.
- CrewAI/OpenHands for later if Bob wants a broader agent platform.

## Custom Code Boundary

Custom code remains appropriate only for:

- Kendall lane policy
- approval gates
- worker adapter contracts
- metadata-only evidence records
- retention enforcement
- fixture scenarios
- integration with existing supervisor/dashboard contracts

Custom code should not initially reimplement:

- a generic durable workflow engine
- a generic multi-agent framework
- a generic model router
- a CI pipeline engine

## Sources

- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- Prefect docs: https://docs.prefect.io/v3/get-started
- Prefect server: https://docs.prefect.io/v3/concepts/server
- Temporal self-host guide: https://docs.temporal.io/self-hosted-guide
- Temporal docs: https://docs.temporal.io/
- CrewAI Flows: https://docs.crewai.com/en/concepts/flows
- CrewAI human feedback: https://docs.crewai.com/en/learn/human-feedback-in-flows
- Dagger docs: https://docs.dagger.io/
- OpenHands SDK: https://docs.openhands.dev/sdk
- n8n self-hosting: https://docs.n8n.io/hosting/
- Node-RED: https://nodered.org/
- Taskfile: https://taskfile.dev/
- just: https://just.systems/man/en/

## Decision

Use the orchestrator spike to evaluate LangGraph with fake workers before custom orchestration runtime code. Preserve Prefect as the fallback mature workflow engine. Keep custom code narrow and policy/adaptor focused.
