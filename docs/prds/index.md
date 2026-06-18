# PRD Index

Date: 2026-06-13
Status: current navigation index

## Active Planning PRDs

| PRD | Status | Implementation Authority |
| --- | --- | --- |
| `local-provider-ollama-disabled-to-limited-execution.md` | Draft, reviewed | Stories 4.1-4.3 are done as non-executing no-call preparation; Story 4.4 is implemented only for the approved VM-to-host endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`; broader provider expansion remains blocked pending successor approval. |
| `subscription-agent-launch-disabled-to-supervised-execution.md` | Draft, reviewed | Stories 5.1-5.4 completed as non-executing prep; Story 8.5 completed the exact-approved artifact-only fixture launch path; direct supervised process launch remains blocked pending explicit process-launch approval. |
| `kendall-vnxt-orchestrator-epic-6.md` | Draft | Story 6.1 is complete for fake-worker orchestration; Story 7.4 later exercised one bounded supervised Codex launch within its exact approval; any successor Codex launch outside that exact approval, all Claude process launch, and live GitHub automation remain blocked pending explicit successor approval. |
| `linux-install-mvp.md` | Draft, recovered | Linux Install MVP planning, implementation docs, and verify-only evidence are combined in the active Linux install lane; install mutation, fresh-host proof, PR delivery, merge, and cleanup remain bounded by their documented authority gates. |

## PRD Review Records

| Review | Purpose |
| --- | --- |
| `local-provider-ollama-prd-review-2026-06-08.md` | Resolves Ollama planning questions; Story 4.4 used the approved VM-to-host endpoint/model only, while endpoint/model/provider expansion remains blocked pending explicit approval. |
| `subscription-agent-launch-prd-review-2026-06-08.md` | Resolves launch planning questions; artifact-only fixture launch evidence exists from Story 8.5, while direct process launch remains blocked pending explicit approval. |

## Implemented Foundation PRDs

| PRD | Current State |
| --- | --- |
| `supervisor-dynamic-routing-mvp-1.md` | Foundation implemented through routing, registry, handoff, provider-disabled, and evidence stories. |
| `supervisor-dynamic-routing-follow-on-roadmap.md` | Follow-on routing evidence and dashboard surfaces implemented through the safe foundation phase. |
| `supervisor-execution-authority-expansion.md` | Execution-attempt control plane, selected bounded launch fixtures, Epic 10 delivery/cleanup planning, and approval-ledger evidence are implemented; additional real execution lanes remain deferred until exact approval. |

## Decision Logs

- `supervisor-dynamic-routing-mvp-1-decision-log.md`
- `supervisor-execution-authority-expansion-decision-log.md`
- `linux-install-mvp-decision-log.md`

## Current Stop Line

Planning PRDs do not approve implementation. Explicit operator approval is required before any blocked execution-authority story can move to ready.
