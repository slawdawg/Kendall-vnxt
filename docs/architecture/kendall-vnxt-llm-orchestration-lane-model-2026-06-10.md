# Kendall_vNxt LLM Orchestration Lane Model

Date: 2026-06-10

## Context

The approved local provider implementation gives Kendall_vNxt one automated model API lane:

- Host Ollama endpoint: `http://192.168.1.128:11434/v1/chat/completions`
- Approved model: `qwen3:14b`
- Approved VM source: `192.168.1.118`

Bob also has subscription or local-tool access to Codex, Claude Code, and GitHub Pro. Those are not currently normal model API providers in Kendall. They should be modeled as worker/workflow lanes unless separate API access is added later.

## Current Lane Model

| Lane | Access Type | Intended Role | Automation Level |
| --- | --- | --- | --- |
| Ollama on host | HTTP API | Economy/default local reasoning lane | Automated by supervisor |
| Codex CLI | CLI worker | Primary implementation/performance coding lane | Orchestrated worker |
| Claude Code CLI | CLI worker | Limited adversarial review / flaw-finding lane | Orchestrated worker, scarce use |
| GitHub Pro | Workflow rails | Issues, PRs, Actions, Codespaces, branch protections | Workflow/orchestration support |

## Routing Preference

Cost preference:

1. Ollama first when the task is local-safe and likely good enough.
2. Codex for implementation-heavy, complex debugging, repo-wide reasoning, and performance-sensitive coding tasks.
3. Claude Code for limited adversarial review of Codex output, high-risk changes, security-sensitive diffs, or major architectural decisions.

Performance preference:

1. Codex is expected to be the strongest implementation lane.
2. Ollama is used to conserve Codex usage by handling preparation, classification, summaries, and cheap validation.
3. Claude is reserved for independent critique rather than routine generation.

## Architectural Decision

Kendall_vNxt should prioritize a task orchestrator over a classic LLM routing gateway.

A classic model router answers: "Which model endpoint should receive this prompt?"

Kendall currently needs an orchestrator that answers:

- Can Ollama handle this cheaply and safely?
- Does this require a coding worker with repo access?
- Should a Codex CLI worker be spawned in an isolated worktree?
- Does the result need a Claude Code adversarial review?
- What verification command, diff artifact, PR, or handoff should be produced?
- What prompt-free telemetry should be retained?

## Router Implication

A self-hosted model router such as LiteLLM may become useful later when Kendall has multiple API-callable providers or multiple local Ollama models. It is not the first need while Codex and Claude are CLI worker lanes.

Near-term target:

```text
Kendall supervisor/orchestrator
  -> Ollama API lane for cheap local reasoning
  -> Codex CLI worker lane for implementation
  -> Claude Code CLI worker lane for limited adversarial review
  -> GitHub Issues/PRs/Actions as durable workflow rails
```

Future target if additional API providers are approved:

```text
Kendall supervisor/orchestrator
  -> authority and retention gates
  -> self-hosted model router
      -> approved Ollama models
      -> approved API providers
  -> CLI worker lanes for coding agents
```

## Retention Boundary

The orchestrator should retain only metadata and durable engineering artifacts:

- task ID
- lane selected
- reason codes
- worktree path or PR link
- changed files
- verification command/result
- provider/worker status
- timing and token/usage metadata where available
- summarized blocker notes

It should not retain raw prompts, raw completions, reasoning traces, provider payloads, secrets, or unnecessary source snippets outside normal Git artifacts.

## Open Questions

- Verify exact non-interactive command behavior for Codex CLI worker execution.
- Verify exact non-interactive command behavior for Claude Code CLI review execution.
- Decide whether Claude Code review workers are allowed to edit files or must run review-only.
- Decide whether GitHub Issues or local workspace manifests are the canonical task queue.
- Evaluate GitHub Models only as a future low-volume API lane after account quotas and access are verified.
