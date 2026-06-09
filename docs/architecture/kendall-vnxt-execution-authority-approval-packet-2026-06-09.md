# Kendall_vNxt Execution Authority Approval Packet

Date: 2026-06-09
Status: approval packet with Options A and B approved for non-executing implementation
Scope: Operator approval choices for blocked Ollama local-provider and subscription-agent launch stories

## Purpose

This packet converts the current blocked execution-authority work into explicit approval choices.

The operator approved Option A on 2026-06-09 for Stories 4.1-4.3 only. The operator approved Option B on 2026-06-09 for Stories 5.1-5.4 only. Real execution options still require explicit approval before a blocked story can move from `Blocked Pending Explicit Approval` to implementation.

## Current Blocked Families

### Ollama Local Provider

- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`

### Ollama Non-Executing Preparation Approved For Review

- `docs/stories/4-1-ollama-provider-settings-and-registry-gates.md`
- `docs/stories/4-2-ollama-prompt-redaction-and-retention-contract.md`
- `docs/stories/4-3-ollama-timeout-cancellation-and-attempt-evidence.md`

### Subscription-Agent Supervised Process Launch

- `docs/stories/5-5-subscription-launch-supervised-process-behind-approval.md`

### Subscription-Agent Non-Executing Preparation Approved For Review

- `docs/stories/5-1-subscription-launch-settings-policy-and-target-registry.md`
- `docs/stories/5-2-subscription-launch-approval-binding-and-stale-rejection.md`
- `docs/stories/5-3-subscription-launch-workspace-output-and-session-contract.md`
- `docs/stories/5-4-subscription-launch-supervisor-lifecycle-disabled-adapter.md`

## Recommended Safe Approval Order

Approve non-executing setup before approving real calls or process launch.

1. Ollama Stories 4.1-4.3: settings, prompt/retention policy, timeout/cancellation evidence with no provider HTTP calls.
2. Subscription Stories 5.1-5.4: settings, approval binding, workspace/output/session contracts, disabled lifecycle adapter with no process launch.
3. Ollama Story 4.4 only after 4.1-4.3 pass and the operator approves a local endpoint, model id, timeout values, and rollback plan.
4. Subscription Story 5.5 only after 5.1-5.4 pass and the operator approves a target, command template, environment allowlist, timeout values, artifact limits, and rollback plan.

## Approval Option A: Ollama Non-Executing Preparation

Approved on 2026-06-09 to clear the Ollama setup blockers without allowing provider calls.

```text
Approve Stories 4.1-4.3 only: implement Ollama-specific disabled-default settings, registry evidence, prompt redaction/retention contracts, timeout/cancellation evidence, dashboard/report/export updates, and no-call fixture tests. Do not add or perform Ollama HTTP calls, endpoint discovery, model discovery, provider/model calls, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch. Review point: stop after Stories 4.1-4.3 are implemented, verified, committed, pushed, and PR-ready. Rollback expectation: disabling the broad local-provider gate or the Ollama-specific gate returns all Ollama evidence to disabled/no-call state.
```

Approved target/provider: Ollama metadata and no-call fixture path only.

Allowed settings/feature flags:

- Broad local-provider gate remains disabled by default.
- Ollama-specific gate remains disabled by default.
- Missing model id rejects future execution.

Still blocked:

- Story 4.4 real provider adapter.
- Any Ollama HTTP call.
- LM Studio, vLLM, llama.cpp, remote provider, premium, command, source mutation, credential, or subscription-agent authority.

## Approval Option B: Subscription Non-Executing Preparation

Approved on 2026-06-09 to clear subscription-agent launch setup blockers without allowing process launch.

```text
Approve Stories 5.1-5.4 only: implement disabled-default launch settings, target registry evidence, launch approval binding and stale rejection, workspace/output/session contracts, disabled process-supervisor lifecycle adapter, dashboard/report/export updates, and no-process fixture tests. Do not launch Codex, Claude, Gemini, Antigravity, or any other process; do not add real command execution, provider/model calls, source mutation, credential/session inheritance, premium execution, external sends, or background runtime assistant behavior. Review point: stop after Stories 5.1-5.4 are implemented, verified, committed, pushed, and PR-ready. Rollback expectation: disabling the launch gate or target-specific policy returns all launch evidence to disabled/non-executing state.
```

Approved target/provider: disabled target registry and disabled lifecycle adapter only.

Allowed settings/feature flags:

- Broad launch gate remains disabled by default.
- Target-specific launch policy remains disabled by default.
- Command templates are identifiers and policy evidence only, not executable commands.

Still blocked:

- Story 5.5 real process launch.
- Any direct launch of Codex, Claude, Gemini, Antigravity, or other subscription-agent process.
- Command execution, source mutation, credential/session inheritance, provider/model calls, premium execution, and external sends.

## Approval Option C: Ollama Limited Execution

Do not use this until Option A is complete and verified.

Required operator-supplied values:

- approved endpoint host and port,
- approved model id,
- connect timeout,
- total timeout,
- cancellation behavior,
- artifact retention limits,
- dashboard enabled-state copy,
- rollback procedure.

The approval must name Story 4.4 and state that Ollama provider HTTP calls are approved only for the named local endpoint and model id.

## Approval Option D: Subscription-Agent Supervised Launch

Do not use this until Option B is complete and verified.

Required operator-supplied values:

- approved launch target,
- command template id and exact command policy,
- environment allowlist,
- forbidden credential/session path policy,
- stdout/stderr artifact limits,
- timeout and cancellation behavior,
- approval expiry policy,
- rollback procedure.

The approval must name Story 5.5 and state that process launch is approved only for the named target and command template.

## Non-Approval Language

The following still do not approve execution authority:

- "work on these"
- "clear blockers"
- "continue"
- "start the long run"
- "implement the backlog"
- "make it feature complete"

Those phrases allow only planning, documentation, tests, dashboard evidence display, no-call fixtures, disabled adapters, and maintenance.

## Evidence To Re-Read Before Implementation

- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-authority-dependency-graph-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-dashboard-command-boundary-2026-06-08.md`
- `docs/architecture/kendall-vnxt-queue-attempt-boundary-and-provider-proofs-2026-06-08.md`
- `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`
- `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`
- `docs/prds/subscription-agent-launch-disabled-to-supervised-execution.md`
- `docs/prds/subscription-agent-launch-prd-review-2026-06-08.md`
