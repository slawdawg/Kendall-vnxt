# Governed Provider Routing Gateway Note

Date: 2026-07-08

## Context

The manager-control-plane delivery lane attempted an independent Claude Code
review from Codex. The tenant policy blocked the call because it would disclose
private workspace code to an external third-party review service.

This exposed a concrete future requirement already aligned with the Kendall_Nxt
roadmap: provider use should route through a governed gateway rather than
direct ad hoc calls from Codex, the manager, dashboard actions, or worker
prompts.

## Durable Requirement

Future provider routing for Ollama, Codex, Claude, and other providers should
go through a repo-owned gateway contract that can produce a dry-run disclosure
packet before any provider call.

The gateway should record, at minimum:

- task type, such as code review, implementation, planning, summarization, or
  validation;
- provider class, such as local, first-party, or third-party external;
- data class, such as metadata-only, repo-private diff, source copy,
  secret-adjacent, or blocked;
- exact scope, including file paths, diff range, worktree, branch, and story or
  work item when available;
- requested tools and denied tools;
- budget cap for paid or scarce providers;
- retention policy, defaulting to metadata and compact findings only;
- explicit approval or authority evidence for external disclosure, paid usage,
  raw payload retention, source mutation, or provider expansion;
- stop lines for secrets, credentials, broad source exfiltration, delivery,
  cleanup, and tenant-policy denial.

## First Safe Slice

The first implementation should be report-only:

1. Add a provider route dry-run command that classifies the request and outputs
   the disclosure packet.
2. Block live provider calls by default.
3. Add tests for scope bounding, secret/high-risk path denial, budget
   requirement, read-only tool enforcement, retention policy, and tenant-policy
   denial.
4. Defer any tenant-policy exception until the dry-run packet, approval model,
   and evidence retention contract exist.

## Report-Only Disclosure Packet Contract

The initial implementation now produces a versioned `ReviewRouteDecision` and
`DisclosurePacket` for preparation only. `report_only`, `simulated`, and
`blocked` are all non-executing states: no live packet is sent to any provider,
adapter, endpoint, CLI, or tool.

The packet is deliberately bounded to metadata-only evidence. It binds one
immutable exact head and digest, an issuer and authority reference, explicit
route/adapter/tool allowlists, a single-use packet ID, and expiry, revocation,
and cancellation state. It has a 16 KiB UTF-8 serialized limit. Unknown fields
and source, diff, prompt, completion, raw payload, reasoning, secret,
credential, token, excluded-vault, customer/production, and broad-dump content
are rejected rather than redacted into a packet.

Static readiness or existing configuration can supply route facts, but cannot
authorize execution. If a packet is stale, revoked, cancelled, expired, used,
or blocked by policy/capability/resources, the recovery action is to reissue or
re-evaluate the metadata-only packet. Live use or promotion involving a private
diff remains a separately governed high-risk change with its own authority,
data-boundary, and retention review.

## Non-Goals

- Do not allow raw `claude`, `codex`, `ollama`, or future provider calls from
  manager automation as a workaround.
- Do not broaden tenant policy before the repo-owned gateway exists.
- Do not retain raw prompts, completions, reasoning traces, provider payloads,
  secrets, or unnecessary source copies by default.
- Do not make Claude a routine implementation lane; keep it a scarce review
  lane unless future policy explicitly changes that.

## Roadmap Linkage

This note refines, but does not replace, the existing provider-neutral worker
and lane-model roadmap. Full PRD/spec work can wait until provider routing
becomes the active roadmap area.
