# Kendall_vNxt Worker Threat Boundary

Date: 2026-06-08
Status: active boundary, real worker execution still denied
Related PRD: `docs/prds/supervisor-execution-authority-expansion.md`
Implemented surface: `GET /supervisor/threat-boundary`

## Purpose

This boundary defines the minimum safety contract before Kendall_vNxt may enable real subscription-agent launch, local provider calls, premium execution, arbitrary worker commands, worker network access, source mutation, or credential access.

The current implementation is intentionally control-plane only. It makes the denial state inspectable and testable; it does not approve any new execution authority.

## Boundary Summary

Real worker/provider execution remains blocked by default until a later provider-specific policy approves all of these surfaces:

- prompt and evidence redaction,
- command allowlisting,
- provider endpoint and network access,
- credential access,
- artifact retention and export.

## Prompt And Evidence Redaction

Allowed prompt/evidence sources for future model-backed workers are limited to:

- work item metadata,
- workflow event summaries,
- routing decision metadata,
- execution attempt metadata,
- approved recipe metadata,
- reviewed artifact references.

The boundary excludes:

- secrets, credentials, tokens, and raw environment values,
- local secret files,
- raw provider request or response payloads,
- unrelated local files,
- external provider prompts or completions unless a later provider-specific retention policy approves them,
- filesystem snapshots outside recorded artifact references.

## Command Boundary

Allowed command classes remain narrow:

- supervisor-owned internal utility functions,
- configured recipe commands after recipe gates,
- Git metadata reads for policy checks.

Blocked command classes include:

- subscription-agent process launch,
- local provider HTTP calls,
- premium provider execution,
- arbitrary shell commands,
- worker source mutation commands,
- network commands,
- credential or secret reads.

Execution attempts continue to set `commandsAllowed=false`. Arbitrary worker shell execution remains disabled by configuration.

## Provider And Network Boundary

Local provider endpoints and external model APIs are denied until a later provider-specific policy approves them. This includes Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, subscription CLIs, premium providers, and worker network access.

The current provider endpoint policy is:

`deny_all_local_and_remote_provider_endpoints_until_provider_specific_policy_approval`

## Credential Boundary

Workers may not read or receive credentials, tokens, environment secrets, account state, production access, customer access, or security/account material.

The current credential policy is:

`forbid_worker_access_to_credentials_tokens_environment_secrets_and_account_security_state`

## Artifact Boundary

Artifacts are represented as references and summaries until snapshot export is approved. Runtime evidence export may include work item, event, attempt, route, workspace isolation, and artifact reference metadata, but it must not include broad filesystem snapshots or secret-bearing payloads.

## Rejection Reasons

Boundary blocks must record stable reasons in API evidence. Current reasons include:

- `prompt_redaction_boundary_required`
- `command_execution_not_allowlisted`
- `provider_network_access_not_enabled`
- `credential_access_forbidden`
- `artifact_snapshot_export_not_enabled`
- `worker_execution_safety_boundary_not_satisfied`

Worker-specific disabled reasons, such as `ollama_local_provider_not_enabled` or `subscription_agent_process_launch_not_enabled`, remain more specific when they are the immediate block.

## Current Evidence

- `GET /supervisor/threat-boundary` exposes the boundary.
- Execution attempt workspace isolation plans include redaction, command, provider endpoint, prompt construction, and boundary rejection metadata.
- Execution attempt events record disabled execution flags and boundary rejection metadata.
- Local evidence packets include the redaction and provider/credential boundary.
- Runtime evidence exports identify excluded secret/provider/filesystem state.

## Still Deferred

This boundary does not approve:

- real subscription-agent launch,
- local provider/model HTTP calls,
- premium execution,
- arbitrary worker shell execution,
- worker source mutation,
- worker network access,
- credential access,
- broad filesystem snapshot export,
- background runtime assistant behavior.
