# Live Memory/Source Enforcement Policy

Status: source-owned policy plus bounded dry-run/read-only live proof.

Last updated: 2026-06-25.

## Purpose

Define the bounded enforcement path for live memory/source work before any canonical write integration exists. This policy turns the Story 7.1 authority gate and Story 8.1 dry-run/read-only integration into source-owned evidence while keeping Obsidian human-owned, LLM-Wiki derived, and `/pipeline` a render/control surface.

This document is not approval for live Obsidian mutation, source mutation, worker launch, provider calls, GitHub delivery, network egress, new persistence, or LLM-Wiki promotion.

## Authority Family

`memory-writeback-and-source-mutation`

All future memory write-back or source mutation stories must name this authority family and prove the matching stop lines, rollback path, audit event, verification evidence, and operator approval source.

## Progressive Authority Sequence

Use this sequence in order:

1. contract/policy first
2. fake adapter
3. dry-run real-tool
4. read-only live
5. bounded write
6. human-approved execution

Skipping a phase is a stop-line violation unless the operator explicitly approves a new bounded story with evidence and rollback.

## Allowed Operations

Allowed in Story 7.1 and Story 8.1 bounded-adapter work:

- read approved source refs as metadata or summaries;
- inspect approved Obsidian source metadata from allowlisted folders in read-only mode;
- create `MemoryProposalV0` records;
- create dry-run real-tool write plans that identify source metadata, target metadata, backup path, rollback path, no-write status, and metadata-only audit evidence;
- create AI draft/write-preview artifacts in approved draft space after explicit operator approval and backup evidence;
- rebuild LLM-Wiki from approved source refs;
- preserve metadata-only evidence;
- block unsafe source states before write-back, source copying, promotion, or authority escalation.

## Forbidden Operations

- direct canonical Obsidian mutation is forbidden;
- LLM-Wiki is derived, disposable, and rebuildable and cannot promote itself to canonical memory;
- LLM-Wiki cannot override Obsidian or approved source refs;
- excluded/private source content cannot be copied, summarized into durable memory, or sent to workers/providers;
- direct source mutation is forbidden;
- `/pipeline` cannot call live Obsidian, source mutation, provider, worker, GitHub, or same-origin runtime APIs from this story;
- raw prompts, completions, reasoning traces, provider payloads, secrets, credentials, whole-source copies, and unnecessary source copies cannot be retained;
- derived evidence cannot escalate its own authority.

## Stop Lines

Block the requested operation when any of these states appear:

- excluded source
- blocked source
- missing source
- unavailable source
- stale source
- unknown source
- malformed source metadata
- contradictory source
- derived-only source
- missing explicit operator approval
- missing approval metadata
- missing backup
- missing rollback
- missing audit event
- unscoped draft/quarantine target
- raw payload retention
- source-copy retention
- unknown operation
- forbidden operation

Blocked states prevent write-back, source copying, promotion, and authority escalation.

Absent or malformed source metadata fails closed. A source ref must identify a known source type, access state, freshness state, canonicality state, and contradiction state before any proposal or draft-preview decision can be allowed.

## Rollback And Recovery

Any future bounded write story must define:

- backup path;
- draft quarantine path;
- proposal rejection path;
- evidence preservation path;
- operator-visible rollback command or manual recovery path;
- no silent retry;
- no automatic canonical note rewrite after a failed or blocked write.

## Audit Event Schema

Every evaluator decision must include metadata-only audit evidence:

```text
authorityFamily
operation
decision
reasonCodes
retentionClass
rawPayloadRetained=false
sourceContentCopied=false
operatorApprovalRequired
backupRequired
rollbackRequired
```

## Operator Approval Requirements

Bounded write-preview or write-back operations require:

- explicit operator approval;
- approval metadata linking the decision to an operator-visible record;
- approved source refs;
- backup path;
- rollback path;
- metadata-only evidence;
- scoped target;
- no excluded/private source content;
- no raw payload retention;
- no source-copy retention.

## Current Implementation Boundary

The current implementation includes a deterministic evaluator and a bounded live adapter. It accepts metadata, returns `allowed`, `blocked`, or `requires_human_gate`, and records reason codes. The Story 8.1 adapter can inspect approved Obsidian source metadata in read-only mode, create no-write dry-run plans, and create approved draft-preview artifacts only inside the configured draft queue after explicit approval metadata plus backup and rollback evidence.

The adapter still does not perform direct canonical Obsidian mutation, source mutation, provider calls, worker launch, network egress, GitHub actions, raw-payload retention, source-copy retention, or LLM-Wiki promotion.

`/pipeline` remains a render/control surface. It may display policy state and blocked reasons, but it must not execute memory/source mutations unless a later bounded live story explicitly grants that authority.
