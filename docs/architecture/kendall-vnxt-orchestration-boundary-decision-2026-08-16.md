# Kendall vNxt Orchestration Boundary Decision (2026-08-16)

Status: accepted Phase 1 contract decision; no engine adoption

## Decision

Kendall vNxt will not adopt, install, configure, or pilot a new orchestration
engine in this Phase 1 slice. The supervisor remains the canonical owner of
work-item identity, lifecycle transitions, authority decisions, evidence, and
terminal outcomes. The governed workspace protocol remains the owner of
workspace delivery and cleanup gates.

This slice extracts only two dependency contracts in
`packages/workflow-core/src/ports/orchestration-ports.ts`:

- `LifecycleEvidencePort` lets a future engine read or append bounded evidence
  for an existing supervisor attempt. It cannot apply a lifecycle transition or
  establish a second workflow ledger.
- `WorkspaceExecutionPort` records the bounded outcome of an already-governed
  workspace attempt. It cannot create or mutate a workspace, deliver a change,
  or perform cleanup.

Both ports extend the existing `RuntimePortDescriptor` boundary. Their
descriptors require Kendall product truth, manager-metadata-only retention, no
tool-native queue or workflow state, no raw payload retention, and no retained
delivery or cleanup authority. The contracts use existing work-item, execution
attempt, authority-decision, idempotency, and evidence identifiers; they add no
parallel lifecycle vocabulary.

## Scope and stop lines

This decision changes source contracts and documentation only. It does not add
an engine dependency, service, database schema, route, worker loop, workspace
CLI behavior, process/session control, tmux integration, provider access, or
delivery/cleanup implementation. It grants no execution or mutation authority.

In particular, an engine adapter must not import a database/session layer,
process control, terminal multiplexer tooling, GitHub tooling, or a provider
SDK. It must not retain native workflow state, raw payloads, delivery authority,
or cleanup authority. The focused manager port and forbidden-boundary tests
assert these stop lines against the contract surface.

## Why no adoption now

The cleanup program requires behavioral contracts before a build-versus-buy
decision, and warns against replacing one large orchestration subsystem with
another without a narrow pilot. Existing source authority also establishes the
supervisor as product truth and requires progressive authority rather than an
implicit control-plane transfer. Contract extraction makes a later comparison
reversible without treating an architecture option as a product capability.

## Reconsideration gate

Any later engine evaluation requires a separately reviewed, source-owned
proposal that names a concrete MVP use case, the exact adapter, retention and
failure behavior, a fake-adapter proof, supervisor lifecycle equivalence,
workspace outcome equivalence, rollback, and the authority profile. Only after
that proof may a narrow pilot be considered. It must not bypass the current
execution, delivery, cleanup, provider, credential, or source-mutation stop
lines.

The existing architecture comparison remains historical planning input, while
the Phase 1 cleanup program and
`docs/architecture/adr-current-product-slice-and-authority.md` govern current
product ownership and authority.
