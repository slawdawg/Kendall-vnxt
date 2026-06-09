# Kendall_vNxt Execution Authority Approval Checkpoints

Date: 2026-06-08
Status: accepted governance baseline
Scope: Approval language and evidence required before blocked execution-authority stories can move to ready

## Purpose

Kendall_vNxt now has reviewed PRDs and blocked implementation stories for future Ollama local-provider execution and subscription-agent launch. This document prevents those blocked stories from being treated as approved merely because planning exists.

Generic continuation instructions do not approve execution authority.

## Current Blocked Execution Stories

### Ollama Local Provider

- `docs/stories/4-1-ollama-provider-settings-and-registry-gates.md`
- `docs/stories/4-2-ollama-prompt-redaction-and-retention-contract.md`
- `docs/stories/4-3-ollama-timeout-cancellation-and-attempt-evidence.md`
- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`

### Subscription-Agent Launch

- `docs/stories/5-1-subscription-launch-settings-policy-and-target-registry.md`
- `docs/stories/5-2-subscription-launch-approval-binding-and-stale-rejection.md`
- `docs/stories/5-3-subscription-launch-workspace-output-and-session-contract.md`
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`
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

No blocked execution-authority story is approved.

Current status remains:

- Ollama provider calls disabled,
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
