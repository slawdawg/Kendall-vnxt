# Product Requirements Boundary

This workflow contract is the Git-backed source of truth for product requirement boundaries that must survive a clean install. It replaces local PRD files as an active verification source. Local BMAD PRDs, PRD reviews, decision logs, epics, stories, and research are workspace artifacts and must remain local-only.

Planning PRDs do not approve implementation. Explicit operator approval is required before any blocked execution-authority story can move to ready.

## Linux Install MVP

Status: delivered lane; source PRD metadata remains draft until a PRD finalization workflow runs.

Linux Install MVP planning, implementation docs, fresh-host proof, rerun evidence, package refresh, PR delivery, and merge completed through PR #144. The post-merge closeout lane adds delivery-state hardening and a retrospective draft synthesis.

Purpose: create a repeatable, validated Kendall_Nxt deployment path for Ubuntu 26.04 or later. A user logs in to an existing Ubuntu session as a non-root sudo-capable Linux user, runs the supported local bootstrap command, and receives an evidence-backed result without moving secrets or relying on chat history.

Product boundary: v1 supports only local in-distro execution on Ubuntu 26.04 or later. The bootstrap may install approved tools, clone or validate the Kendall_Nxt repo, run setup and verification, and write redacted evidence. It must not create machines, create Linux users, automate SSH orchestration, run staged remote scripts, perform provider login, start persistent workers, reboot, or perform cleanup without separate explicit authority.

Functional requirement coverage is recovered through FR39.

Key requirements:

- FR1: Ubuntu 26.04 LTS or later is the first certified Linux target.
- FR2: v1 supports exactly one install method: a local Linux user runs the single Kendall_Nxt bootstrap command or script from inside the Ubuntu session.
- FR3-FR6: fail closed before mutation for root, unsupported OS/version, missing sudo, or missing local readiness.
- FR7-FR10: provide plan and verify-only modes, keep `--install-kendall-vnxt` as the only mutating install command, and reject unsupported remote or staged install arguments.
- FR11-FR17: install or verify approved base tools, validate or clone the repo, run setup, and run Linux install validation in verify-only mode.
- FR18-FR21: emit schema-compliant success, failure, or blocked evidence under approved Linux install evidence paths without overwriting packets.
- FR22-FR23: never automate GitHub auth, Codex login, Claude auth, Tailscale login, provider auth, browser login flows, token writes, credential helper mutation, or private key handling; list manual auth tasks only.
- FR24-FR39: preserve idempotent reruns, redaction, release gates, blocker packets, safe continuation, completion reports, supported-install documentation, source reachability, fresh-host proof, package refresh, and final verification/code review evidence.

## Kendall vNxt Orchestrator Epic 6

Status: draft requirements folded into source-owned architecture and workflow contracts.

Story 6.1 is complete for fake-worker orchestration. Story 7.4 later exercised one bounded supervised Codex launch within its exact approval. Any successor Codex launch outside that exact approval, all Claude process launch, and live GitHub automation remain blocked pending explicit successor approval.

## Local Provider Ollama Boundary

Status: draft and reviewed requirements folded into source-owned execution authority contracts.

Stories 4.1-4.3 are done as non-executing no-call preparation. Story 4.4 is implemented only for the approved VM-to-host endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`. Broader provider expansion remains blocked pending successor approval.

The reviewed Ollama planning questions are resolved for the approved endpoint/model only. Endpoint, model, or provider expansion remains blocked pending explicit approval.

## Subscription-Agent Launch Boundary

Status: draft and reviewed requirements folded into source-owned execution authority contracts.

Stories 5.1-5.4 completed as non-executing preparation. Story 8.5 completed the exact-approved artifact-only fixture launch path. Direct supervised process launch remains blocked pending explicit process-launch approval.

The reviewed subscription-agent launch planning questions are resolved for artifact-only fixture evidence. Direct process launch remains blocked pending explicit approval.

## Supervisor Dynamic Routing Boundary

Status: foundation implemented.

The dynamic routing MVP foundation is implemented through routing, registry, handoff, provider-disabled, and evidence stories. Follow-on routing evidence and dashboard surfaces are implemented through the safe foundation phase.

Dynamic routing remains a policy simulator and routing evidence surface unless a later authority contract explicitly approves execution.

## Supervisor Execution Authority Expansion Boundary

Status: source-owned execution boundary.

The execution-attempt control plane, selected bounded launch fixtures, Epic 10 delivery and cleanup planning, and approval-ledger evidence are implemented. Additional real execution lanes remain deferred until exact approval.

Execution authority expansion requirements are now governed by source-owned workflow contracts:

- `docs/workflows/execution-authority-boundary.md`
- `docs/workflows/current-session-runbook.md`

## Local-Only Artifacts

The following local artifact families must not be required by clean installs:

- BMAD PRDs and PRD reviews
- PRD decision logs
- Epics and story planning artifacts
- Research notes and handoffs
- Local approval packets

If runtime code or drift checks need a durable product requirement, add it to this source-owned workflow contract or a more specific workflow contract instead of adding local PRD files to Git.
