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

The packet is deliberately bounded to metadata-only local retention. It binds one
immutable exact head and digest, an issuer and authority reference, explicit
route/adapter/tool allowlists, a single-use packet ID, and expiry, revocation,
and cancellation state. It has a 16 KiB UTF-8 serialized limit. Unknown fields
and source, prompt, completion, raw payload, reasoning, secret, credential,
token, excluded-vault, customer/production, and broad-dump content are rejected
rather than redacted into a packet. The approved exception is a sanitized,
path-scoped private-diff classification: it carries only allowlisted
repository-relative paths and SHA-256 diff digests, never diff text.

Static readiness or existing configuration can supply route facts, but cannot
authorize execution. If a packet is stale, revoked, cancelled, expired, used,
or blocked by policy/capability/resources, the recovery action is to reissue or
re-evaluate the metadata-only packet. Live use or promotion involving a private
diff remains a separately governed high-risk change with its own authority,
data-boundary, and retention review.

## Simulated Normalized Findings

The fixed `simulated-review-fixture/v1` is a deterministic fixture only. It
accepts one valid simulated Disclosure Packet and emits compact, provider-neutral
Normalized Findings for contract and recovery testing. It sends no packet to
Claude, Ollama, or any other provider, and it has no tools, network, process,
browser, credential, or raw-content operation.

Every finding is bound to the packet's exact reviewed head and digest. A changed
head or digest makes prior results `stale`; stale results contain no findings,
are ineligible as delivery evidence, and require reissuing a current packet and
re-evaluating. Policy vetoes, capability/resource blocks, timeouts, and terminal
packets similarly return typed non-executing no-findings results. Any live route
or private-diff promotion remains out of scope for this simulated slice.

This pure fixture does not persist a single-use consumption claim. Its completed
result is therefore not delivery-evidence eligible. The supervisor-owned
delegated runtime, not this fixture, reserves, claims, revalidates, and
finalizes a durable attempt before a real route can use its result.

## Canonical Report-Only Review Fallback

Review preparation uses the ordered contract `claude_readonly → ollama_exact →
bmad_local`. A Claude tenant-policy veto, unavailability, scope rejection,
empty result, timeout, cancellation, or bounded failure is a typed stop, not a
direct CLI workaround. Ollama can be
prepared only after that typed skip, the existing exact endpoint/model gate, and
a review-specific local-provider approval. The selector performs no process,
network, tool, or provider action and retains no raw packet content. If neither
provider candidate nor a bounded BMAD reviewer is eligible, it returns
`review_unsatisfied`; delivery must stop.

## Delegated Runtime Boundary

The manager selector and injected executor remain pure preparation contracts.
The supervisor-owned delegated runtime is the only runtime registration point
for a valid authorized packet. It owns the constrained provider transport,
fixed Claude adapter, exact-gated Ollama adapter, and named governed BMAD port.
Manager and dashboard code do not import provider SDKs, process APIs, or
provider endpoints. Tests use fake materializers/adapters and make no provider
call.

- Claude receives a fixed argv-only invocation with `Read,Grep` as the complete
  tool allowlist. It has no shell string and no per-run dollar/budget flag.
- Claude and Ollama both receive a sanitized transient diff scope; the packet
  and terminal record retain only allowlisted paths and diff digests.
- Ollama is admissible only after the typed Claude stop and a fresh supervisor
  exact endpoint/model gate. Evidence explanation and review share the bounded
  HTTP transport but retain separate task adapters and allowed data classes.
- The runtime reserves and claims an `ExecutionAttempt` before materialization
  and each route, rechecks identity/authority/revocation/cancellation before
  send and after await, then finalizes only metadata receipts plus strictly
  validated normalized findings. Stale, failed, cancelled, timed-out,
  malformed, and inconclusive outcomes block delivery with a typed recovery
  action.

The BMAD runner is registered only at supervisor composition time through the
existing governed local review boundary. If it is unavailable or inconclusive,
the runtime blocks delivery; it never substitutes a shell/API workaround.

## Non-Goals

- Do not allow raw `claude`, `codex`, `ollama`, or future provider calls from
  manager automation as a workaround.
- Do not broaden tenant policy before the repo-owned gateway exists.
- Do not retain raw prompts, completions, reasoning traces, provider payloads,
  secrets, or unnecessary source copies by default.
- Do not make Claude a routine implementation lane; it remains the default
  bounded read-only review lane only.

## Roadmap Linkage

This note refines, but does not replace, the existing provider-neutral worker
and lane-model roadmap. Full PRD/spec work can wait until provider routing
becomes the active roadmap area.
