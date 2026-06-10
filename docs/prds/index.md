# PRD Index

Date: 2026-06-08
Status: current navigation index

## Active Planning PRDs

| PRD | Status | Implementation Authority |
| --- | --- | --- |
| `local-provider-ollama-disabled-to-limited-execution.md` | Draft, reviewed | Stories 4.1-4.3 are done as non-executing no-call preparation; Story 4.4 is approved only for VM-to-host endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`. |
| `subscription-agent-launch-disabled-to-supervised-execution.md` | Draft, reviewed | Stories 5.1-5.4 completed as non-executing prep; Story 5.5 remains blocked pending explicit process-launch approval. |
| `kendall-vnxt-orchestrator-epic-6.md` | Draft | Story 6.1 approved for fake-worker orchestration only; real Codex/Claude process launch and live GitHub operations remain blocked pending explicit approval. |

## PRD Review Records

| Review | Purpose |
| --- | --- |
| `local-provider-ollama-prd-review-2026-06-08.md` | Resolves Ollama planning questions and keeps implementation blocked pending explicit approval. |
| `subscription-agent-launch-prd-review-2026-06-08.md` | Resolves launch planning questions and keeps implementation blocked pending explicit approval. |

## Implemented Foundation PRDs

| PRD | Current State |
| --- | --- |
| `supervisor-dynamic-routing-mvp-1.md` | Foundation implemented through routing, registry, handoff, provider-disabled, and evidence stories. |
| `supervisor-dynamic-routing-follow-on-roadmap.md` | Follow-on routing evidence and dashboard surfaces implemented through the safe foundation phase. |
| `supervisor-execution-authority-expansion.md` | Non-executing execution-attempt control plane implemented; real execution remains deferred. |

## Decision Logs

- `supervisor-dynamic-routing-mvp-1-decision-log.md`
- `supervisor-execution-authority-expansion-decision-log.md`

## Current Stop Line

Planning PRDs do not approve implementation. Explicit operator approval is required before any blocked execution-authority story can move to ready.
