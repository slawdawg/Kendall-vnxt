# Kendall_vNxt Execution Authority Approval Checkpoints

Date: 2026-06-08
Status: accepted governance baseline
Scope: Approval language and evidence required before blocked execution-authority stories can move to ready

## Purpose

Kendall_vNxt now has reviewed PRDs and blocked implementation stories for future Ollama local-provider execution and subscription-agent launch. This document prevents those blocked stories from being treated as approved merely because planning exists.

Generic continuation instructions do not approve execution authority.

On 2026-06-09, the operator explicitly approved Stories 4.1-4.3 for non-executing Ollama preparation only. That approval allows disabled-default settings, registry evidence, prompt redaction/retention contracts, timeout/cancellation evidence, dashboard/report/export updates, and no-call fixture tests. It does not approve Story 4.4, Ollama HTTP calls, endpoint discovery, model discovery, provider/model calls, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch.

On 2026-06-10, the operator explicitly approved Story 4.4 for Ollama limited execution only. That approval allows Ollama provider HTTP calls only from the Kendall_vNxt VM at `192.168.1.118` to endpoint `http://192.168.1.128:11434/v1/chat/completions` using model `qwen3:14b`, with a 2 second connect timeout, 120 second total timeout, metadata-only retention, and rollback by disabling either provider gate. It does not approve endpoint discovery, model discovery, raw prompt/completion/reasoning/provider payload retention, alternate endpoints, alternate models, LM Studio, vLLM, llama.cpp, remote providers, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch.

On 2026-06-09, the operator explicitly approved subscription-agent launch Stories 5.1-5.4 for non-executing preparation only. That approval allows disabled-default launch settings, target registry evidence, launch approval binding and stale rejection, workspace/output/session contracts, disabled lifecycle adapter evidence, dashboard/report/export updates, and no-process fixture tests. It does not approve Story 5.5, real process launch, command execution, credential/session access, source mutation by workers, external sends, provider/model calls, premium execution, or supervised subscription-agent process execution.

## Current Blocked Execution Stories

### Ollama Local Provider

No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model. Any endpoint, model, provider, or retention expansion still requires explicit successor approval.

### Subscription-Agent Launch

- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`

## Approval Language Required

To unblock one of these authority families, the operator must explicitly say which authority is approved and what scope is approved.

Acceptable approval must name:

- authority family: Ollama local provider or subscription-agent launch,
- approved story ids or exact slice,
- allowed target or provider,
- allowed settings/feature flags,
- allowed endpoint or command-template policy,
- approval expiry or review point,
- rollback expectation.

Examples of language that is specific enough:

- "Approve Story 4.1 only: implement Ollama-specific disabled-default settings and registry evidence. Do not call Ollama."
- "Approve Stories 5.1-5.2 only: implement launch settings and approval binding. Do not launch a process."
- "Approve Story 4.4 for local Ollama execution using endpoint X and model Y with the rollback plan in the PRD."

## Language That Is Not Approval

The following do not approve execution authority:

- "continue",
- "keep going",
- "do the next item",
- "make it feature complete",
- "do all remaining work",
- "start real development",
- "implement the backlog",
- "maintenance",
- "refactor",
- "cleanup",
- "unblock everything".

Those instructions may authorize safe planning, documentation, tests, dashboards, non-executing control-plane work, and maintenance. They do not authorize provider calls, process launch, command execution, source mutation by workers, network access, credential access, premium execution, or background runtime assistant behavior.

## Evidence Required Before Readying A Blocked Story

Before a blocked execution story can move to ready, the implementer must inspect and cite:

- the relevant PRD,
- the PRD review record,
- authority dependency graph,
- execution-readiness report,
- threat boundary,
- dashboard command boundary,
- queue/attempt boundary,
- rollback expectations,
- latest passing verification relevant to that story.

## Current Decision

Stories 4.1-4.3 are approved only for non-executing Ollama preparation and no-call fixture evidence. Stories 5.1-5.4 are approved only for non-executing subscription-agent launch preparation and no-process fixture evidence.

Current status remains:

- Ollama provider calls limited to the approved Story 4.4 VM-to-host endpoint/model and disabled unless all exact gates are configured,
- LM Studio provider calls disabled,
- vLLM provider calls disabled,
- llama.cpp provider calls disabled,
- subscription-agent process launch disabled,
- premium execution disabled,
- arbitrary shell execution disabled,
- worker source mutation disabled,
- worker network access disabled,
- worker credential access disabled.

## Maintenance Allowed Without Additional Approval

The following remain safe to continue:

- documentation and story refinement,
- tests proving disabled defaults,
- dashboard evidence display,
- runtime evidence export polish,
- no-call fixtures,
- non-executing adapters,
- refactoring that does not add execution authority,
- repo hygiene.
