# KNX Mature Tool Review - Orchestrator Lane Architecture

Last updated: 2026-06-10

Decision status: accepted for pilot; custom full implementation deferred

Capability reviewed: Kendall_vNxt orchestrator-first lane architecture for assigning work across Ollama API, Codex CLI, Claude Code CLI, and GitHub workflow rails.

## Job To Be Done

Help Bob conserve scarce assistant resources and reduce coordination burden by assigning work to the cheapest suitable lane, escalating to stronger CLI workers when needed, requiring independent review for risky changes, and preserving resumable evidence.

## Research Questions

- Which mature self-hosted or local-first tools already solve orchestration, durable state, human approval, CLI worker execution, or coding-agent coordination?
- Which tools fit Kendall's local-first, metadata-retention, explicit-approval, and custom-code-last posture?
- Which tools are too broad, cloud-oriented, costly, or unsafe for the current VM/host topology?
- What narrow custom glue remains after mature tools are considered?

## Options Considered

| Option | Fit | Concern | Current Recommendation |
| --- | --- | --- | --- |
| Existing Git worktree + GitHub CLI + repo-owned workspace script | Already proven in Kendall workspace flow; local and simple | Does not provide generic job state machine or worker orchestration by itself | Keep as foundation |
| LangGraph | Strong fit for graph state, persistence, human-in-the-loop checkpoints, and Python-native orchestration | Adds LangChain ecosystem dependency; not a full external process supervisor | Accept for fake-worker pilot |
| Prefect | Python workflow orchestration with state tracking, retries, monitoring, local/self-hosted execution | Data-pipeline orientation; less direct fit for agent lane semantics | Keep as fallback workflow engine |
| Temporal | Mature durable execution platform with retries and resumability | Operationally heavier; requires Temporal service and workflow discipline; may be overkill for local spike | Defer unless reliability needs exceed simple local state |
| Dagger | Mature local/CI build-test-ship automation | More CI pipeline than agent/job orchestrator; useful for verification rails | Consider for verification pipelines, not lane selection |
| Taskfile / just | Lightweight local command runners | No durable state, approval checkpoints, or worker lifecycle | Use for developer commands only |
| CrewAI | Strong multi-agent/flow abstraction with human feedback features | Agent-role abstraction may increase autonomy risk; heavier dependency surface | Defer |
| OpenHands | Mature-ish open-source software-agent platform/SDK with local/cloud execution | May duplicate Codex/Claude lanes; large surface area and security review burden | Research only if replacing CLI worker lanes is desired |
| n8n / Node-RED | Self-hosted/low-code automation | Poor fit for repo mutation, strict source boundaries, and test-first software workflow | Reject for orchestrator core |
| LiteLLM | Mature LLM gateway/router | Useful only when multiple API-callable model providers exist | Defer for now |
| AutoGen / Microsoft Agent Framework | Multi-agent patterns and Microsoft-backed direction | AutoGen transition/maintenance state requires separate review | Defer pending Microsoft Agent Framework review |

## Fit Against Execution Policy

The execution ladder requires mature tools and deterministic local processing before custom glue. The current orchestrator spec violated the spirit of that rule by moving directly to custom lane selector and fake-worker adapters before recording a mature-tool comparison.

Corrected posture:

1. Keep the current docs as a product/spec draft.
2. Add a mature-tool review gate before implementation.
3. Prefer a mature local workflow engine if it can own job state, retries, approvals, and resumability.
4. Keep custom code limited to Kendall-specific policy, adapters, evidence formatting, and retention boundaries.

## Fit Against Data Boundaries

Preferred options must run locally or self-hosted and must support metadata-only retention. Any hosted control plane, external model send, credential access, or source mutation requires explicit successor approval.

The current Story 4.4 Ollama approval allows only the named host endpoint/model. It does not approve additional model providers, hosted orchestrators, GitHub remote automation, Codex CLI launch, or Claude Code CLI launch.

## Cost Posture

Preferred:

- local/self-hosted open-source tooling
- no new hosted service signup
- no new API billing
- no routine GitHub Actions consumption for orchestration

Allowed later only by explicit approval:

- GitHub Models
- hosted LangSmith/LangGraph Platform
- Temporal Cloud
- CrewAI managed/cloud offerings
- OpenHands cloud
- external API model providers

## Security And Privacy Posture

Mature tooling must preserve:

- exact provider/model allowlists
- review-only Claude default
- isolated worktrees for mutating jobs
- no raw prompt/completion/reasoning retention
- explicit approval for process launch and source mutation
- deterministic blocked states for unavailable lanes

Tools that encourage autonomous broad tool use, broad repo mutation, or hidden external telemetry require extra scrutiny.

## Maintenance And Dependency Posture

Best near-term candidates:

1. Existing repo-owned workspace protocol plus a small local job-state layer.
2. LangGraph or Prefect if they reduce state-machine/retry/human-checkpoint custom code.
3. Dagger only for build/test verification portability.

Deferred or risky:

- Temporal unless job durability requirements justify the service.
- OpenHands unless Bob wants to replace Codex/Claude CLI lanes.
- CrewAI unless role-based multi-agent flows prove useful without increasing autonomy risk.
- AutoGen until Microsoft Agent Framework direction is reviewed separately.

## Recommendation

Pilot LangGraph as the mature orchestration core for the first fake-worker spike.

Keep the existing Git worktree/GitHub CLI workspace protocol as the execution foundation. Keep Prefect as the fallback if the problem proves to be more workflow-operations than agent-state graph.

Do not implement custom full orchestration runtime code yet. Custom code remains limited to Kendall-specific lane policy, approval gates, worker adapter contracts, metadata-only evidence, retention enforcement, and fixture scenarios.

## Custom-Code Scope If Needed

Custom code should be limited to:

- Kendall lane policy and approval gates
- provider/worker adapter interfaces
- metadata-only evidence records
- retention enforcement
- scenario fixtures
- migration/rollback from a mature tool if selected tool fails

Custom code should not reimplement:

- full workflow scheduling
- durable execution engine
- generic multi-agent framework
- CI pipeline engine
- hosted model router

## Rollback Or Exit Path

- If a mature tool is selected and proves too heavy, fall back to the existing repo-owned workspace protocol plus deterministic local job records.
- If a mature tool introduces external sends or unsafe mutation, reject it and keep the fake-worker spike.
- If custom glue grows beyond policy/adapters/evidence, reopen mature-tool review.

## Evidence Links

- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- CrewAI docs: https://docs.crewai.com/
- Temporal docs: https://docs.temporal.io/
- Prefect docs: https://docs.prefect.io/v3/get-started
- Prefect server: https://docs.prefect.io/v3/concepts/server
- Dagger docs: https://docs.dagger.io/
- OpenHands SDK docs: https://docs.openhands.dev/sdk
- n8n self-hosting docs: https://docs.n8n.io/hosting/
- Node-RED docs: https://nodered.org/
- Taskfile docs: https://taskfile.dev/
- just manual: https://just.systems/man/en/
- LiteLLM routing docs: https://docs.litellm.ai/docs/routing
- AutoGen GitHub maintenance note: https://github.com/microsoft/autogen
- Mature comparison doc: `docs/architecture/kendall-vnxt-orchestrator-mature-tool-comparison-2026-06-10.md`
- Existing Kendall workspace review: `_bmad/memory/knx/decisions/mature-tool-codex-workspace-orchestration-2026-06-10.md`

## Assumptions And Open Questions

- Bob prefers self-hosted/local tooling and custom code last.
- Codex and Claude are CLI worker lanes, not API providers.
- We have not installed or executed candidate tools.
- Need separate review of Microsoft Agent Framework if considering the AutoGen successor path.
- Need account/local verification before assuming Claude Code non-interactive behavior, Codex CLI worker behavior, or GitHub Models quotas.
