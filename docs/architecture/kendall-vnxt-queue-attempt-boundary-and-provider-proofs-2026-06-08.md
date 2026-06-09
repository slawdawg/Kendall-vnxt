# Kendall_vNxt Queue Attempt Boundary And Provider Proofs

Date: 2026-06-08
Status: accepted planning and implementation baseline
Scope: Queue lease boundary, execution attempt boundary, and disabled local provider proof fixtures

## Purpose

This document prevents future process lifecycle work from confusing supervisor scheduling state with worker execution authority.

Queue leases answer who currently owns supervisor processing for a work item. Execution attempts answer what worker authority was planned, rejected, approved, cancelled, failed, or completed as auditable evidence.

## Boundary Contract

Queue leases may contain:

- work item id,
- heartbeat time,
- lease expiry,
- fencing token,
- scheduling attempt count,
- active flag.

Queue leases must not contain:

- worker id,
- provider endpoint,
- process id,
- command line,
- credential reference,
- workspace write root,
- approval binding.

Execution attempts may contain:

- route decision id,
- selected worker,
- lane,
- authority mode,
- lifecycle status,
- requested actor,
- rejection, failure, and cancellation reasons,
- workspace isolation plan,
- artifact references,
- event references.

Execution attempts do not launch workers by themselves. They are the evidence and lifecycle attachment point for future process execution only after explicit PRD approval.

## Runtime Boundary Surface

The supervisor exposes `GET /supervisor/execution-state-boundary`.

The endpoint is read-only and states:

- the queue lease role,
- the execution attempt role,
- fields forbidden from queue leases,
- future process lifecycle evidence that must attach to execution attempts,
- false capability flags for queue leases granting authority and attempts launching workers.

## Disabled Provider Proofs

The supervisor also exposes `GET /supervisor/disabled-provider-proofs`.

Each disabled local provider entry must have no-call proof evidence:

- provider worker id,
- provider label,
- disabled reason,
- deny-all endpoint policy,
- HTTP calls attempted is false,
- model calls attempted is false,
- network access attempted is false,
- credential access attempted is false,
- redaction fixture checks.

The current provider proof set covers:

- Ollama,
- LM Studio,
- vLLM,
- llama.cpp.

## Stop Line

These surfaces are evidence only. They do not enable:

- local provider HTTP calls,
- remote provider calls,
- model API calls,
- process launch,
- command execution,
- source mutation,
- worker network access,
- credential access,
- adaptive scoring.

## Verification Expectations

Changes touching these boundaries should prove:

- the endpoints do not record workflow events,
- provider proofs remain provider-specific,
- all no-call proof booleans remain false,
- queue leases remain free of worker authority and process fields,
- execution attempts remain the future attachment point for process lifecycle evidence.
