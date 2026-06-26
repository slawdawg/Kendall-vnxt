# Live Memory/Source Enforcement Policy

Status: source-owned policy plus bounded dry-run/read-only live proof.

Last updated: 2026-06-26.

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

## Live Readiness Gate

Before any read-only live Obsidian proof, run:

```text
node scripts/knx-obsidian-memory.mjs live-readiness --config PATH
```

To create a redacted packet template for the operator to complete, run:

```text
node scripts/knx-obsidian-memory.mjs live-readiness-template
```

The template contains placeholders by design. It is not readiness evidence and
must fail the readiness gate until the operator replaces every placeholder with
approved vault, sync, backup, boundary, and review evidence.

To create an operator-facing handoff packet from a candidate config without
reading notes or performing any writes, run:

```text
node scripts/knx-obsidian-memory.mjs live-handoff-packet --config PATH [--note NOTE_PATH] [--work-item-id WORK_ITEM_ID] [--approval-ref REF] [--approved-by NAME]
```

The handoff packet reports readiness checklist status, blocked reason codes,
and the exact argv arrays for the next safe commands. It does not execute those
commands. If the packet is blocked, no live note proof or end-to-end live plan is
authorized. If it is ready, the next command is still `live-readiness`; the
packet is an operator handoff artifact, not a substitute for retained command
evidence.

The command is a no-scan/no-write metadata gate. It does not read note content,
create proposals, create backups, mutate Obsidian, call providers, launch
workers, call GitHub, send externally, or retain raw payloads.

The gate must return `status=ready` before a later read-only live proof can be
attempted. Required evidence:

- config validation is clean with no concerns or failures;
- live vault path exists and is a directory;
- backup root exists, is outside the vault, and is a directory;
- final live read allowlist is explicit;
- queue/private/excluded folders are excluded from reads;
- sync mechanism is one of `obsidian-sync`, `headless-sync`,
  `local-folder-manual`, or `external-sync`;
- sync health is `healthy` or `manual-current`;
- sync check timestamp is recorded as a parseable date/time;
- operator approval ref is recorded and is not a placeholder;
- read-only proof approval ref is recorded and is not a placeholder;
- source boundary ref is recorded and is not a placeholder;
- KOM safety review ref is recorded and is not a placeholder.

If the gate blocks, the next action is to supply the missing evidence or rerun
KOM safety review. Blocking the readiness gate does not authorize a live vault
read.

After the readiness gate returns `status=ready`, use the readiness-enforced live
proof command for the first approved live note read:

```text
node scripts/knx-obsidian-memory.mjs live-read-only-proof --config PATH --note NOTE_PATH
```

This command runs the live-readiness gate first and returns blocked metadata
without reading the requested note when readiness is incomplete. It may read only
the single requested allowlisted note after readiness is ready. It does not write
to Obsidian, persist proposals, create backups, mutate source notes, call
providers, launch workers, call GitHub, send externally, or retain raw/source
content.

When the live proof is allowed, the result includes a `dashboardProposal` object
matching the supervisor `MemoryProposalV0` create payload. The payload must carry
source refs, evidence refs, sensitivity, freshness, contradiction status,
confidence, target queue metadata, recovery text, and `writeBackAllowed=false`.
It is still a review proposal only; persisting it to the supervisor does not
authorize an Obsidian write-back.

To preview the exact supervisor persistence request without network egress or
persistence, run:

```text
node scripts/knx-obsidian-memory.mjs proposal-persist-plan --config PATH --note NOTE_PATH --work-item-id WORK_ITEM_ID [--live]
```

Without `--live`, the command uses the local/fixture proof path. With `--live`,
it runs the readiness-enforced live proof first. The output is a dry-run
`supervisorRequest` envelope with method, path, and body. It does not call the
supervisor, persist dashboard state, write Obsidian, create backups, call
providers, launch workers, call GitHub, send externally, or retain raw/source
content.

The supervisor memory proposal API accepts the proof-derived payload shape with
Obsidian source/evidence refs and queue target metadata. The accepted state is
dashboard review state only and must keep `writeBackAllowed=false`.

Before any tool persists a dry-run supervisor request, create an explicit
metadata-only persistence approval packet:

```text
node scripts/knx-obsidian-memory.mjs proposal-persist-approval-packet --plan PATH --approval-ref REF [--approved-by NAME]
```

The approval packet validates that the dry-run plan is ready, targets
`POST /work-items/{id}/memory-proposals`, contains a pending dashboard proposal,
keeps `writeBackAllowed=false`, carries source/evidence refs, and has explicit
operator approval metadata. It still does not call the supervisor, persist
dashboard state, write Obsidian, create backups, call providers, launch
workers, call GitHub, send externally, or retain raw/source content.

To convert that approved packet into an exact local supervisor request plan
without executing it, run:

```text
node scripts/knx-obsidian-memory.mjs proposal-persist-execution-plan --packet PATH [--supervisor-url URL]
```

The execution plan accepts only local supervisor URLs such as
`http://127.0.0.1:8000` or `http://localhost:8000`. It emits the planned HTTP
request and argv-safe `curl` command, but it does not run the command, call the
supervisor, persist dashboard state, write Obsidian, create backups, call
providers, launch workers, call GitHub, send externally, or retain raw/source
content.

To preview the full proof-to-draft sequence without network egress, supervisor
persistence, backup creation, or Obsidian writes, run:

```text
node scripts/knx-obsidian-memory.mjs end-to-end-plan --config PATH --note NOTE_PATH --work-item-id WORK_ITEM_ID --approval-ref REF [--approved-by NAME] [--live]
```

The end-to-end plan composes the readiness-enforced proof, dashboard proposal
persistence dry-run, draft approval packet, and approved draft write dry-run. In
`--live` mode it stops at the live readiness gate before reading the note if
vault, sync, backup, boundary, approval, or safety evidence is missing. A ready
plan is still a plan only: it does not call the supervisor, persist dashboard
state, create backups, write Obsidian, call providers, launch workers, call
GitHub, send externally, or retain raw/source content.

After dashboard review approves a proposal for a future draft, create a
metadata-only draft approval packet before using any write-back command:

```text
node scripts/knx-obsidian-memory.mjs draft-approval-packet --proposal PATH --approval-ref REF [--approved-by NAME]
```

The approval packet bridges supervisor review state into the existing
`write-approved-draft` gate by adding explicit operator approval metadata. It
does not write Obsidian, persist supervisor state, create backups, call
providers, launch workers, call GitHub, send externally, or retain raw/source
content. The later `write-approved-draft --apply` step still requires the draft
target to remain inside the dashboard queue and creates backup/rollback evidence
before writing an AI draft.

`write-approved-draft` accepts either the inner `approvalPacket` object or the
full `draft-approval-packet` command output. Both forms are scanned for forbidden
raw payload fields before the dry-run or apply gate can proceed.

## Current Implementation Boundary

The current implementation includes a deterministic evaluator and a bounded live adapter. It accepts metadata, returns `allowed`, `blocked`, or `requires_human_gate`, and records reason codes. The Story 8.1 adapter can inspect approved Obsidian source metadata in read-only mode, create no-write dry-run plans, and create approved draft-preview artifacts only inside the configured draft queue after explicit approval metadata plus backup and rollback evidence.

The adapter still does not perform direct canonical Obsidian mutation, source mutation, provider calls, worker launch, network egress, GitHub actions, raw-payload retention, source-copy retention, or LLM-Wiki promotion.

`/pipeline` remains a render/control surface. It may display policy state and blocked reasons, but it must not execute memory/source mutations unless a later bounded live story explicitly grants that authority.
