# Hermes Autonomous Delivery Runtime Preflight

This runbook is the source-owned, local-only readiness posture for the Hermes
runtime. It does not install or start Hermes, create a profile or board, enable
a gateway, admit work, call a provider, or grant authority to do any of those
things.

## Preflight

Before any later explicitly approved runtime slice, an operator records only
bounded local inspection facts in an existing private file outside the checkout,
then runs:

```bash
pnpm run hermes:preflight -- --facts /absolute/private/hermes-inspection.json
```

The facts must contain the exact Hermes pin `v0.20.6 / v2026.8.27`, a structured
compatible local Codex CLI/app-server capability fact, an existing isolated
data root outside the repository, and a healthy local inspection with
`network`, `api`, and `gateway` all disabled. The command returns JSON with `ready` or
`not_ready`, a closed reason code, and a next safe action. It reads facts only:
it does not invoke Hermes or Codex, create data, or retain raw output, secrets,
or logs.

`not_ready` is a stop line. In particular, a missing binary, malformed fact,
pin mismatch, unavailable path, in-repository or symlink-resolving data root,
incompatible Codex fact, non-local health, or enabled gateway remains blocked;
there is no floating-version fallback and no automatic remediation.

## Local State And Health Evidence

Choose an existing ignored local data root outside the checkout, for example a
dedicated owner-private directory selected by the operator. The root must be a
directory owned by the current local user with no group or other permissions;
do not use `/`, `/tmp`, or a broad home directory. Runtime databases, logs,
backups, and secrets must remain outside Git and must not be copied into
`_bmad-output/`, the repository, or a tracked fixture. Record only the bounded
preflight result as evidence.

Health means `healthy`, `local`, `network: disabled`, `api: disabled`, and
`gateway: disabled` in the structured inspection facts. It is not a profile/board enablement signal and does not
authorize worker launch or admission.

## Backup, Pin-Preserving Change, And Rollback

For a later approved version change, take a snapshot before update of the
isolated local data root and retain its location under the operator's private
recovery procedure. Confirm the exact pin and healthy local-only state before
and after the change. If either validation fails, stop the change and rollback
to the previously validated pinned runtime and snapshot. Never use `latest`.

This runbook does not perform a backup, update, rollback, archive, restore, or
delete operation; those are an operator procedure for a later approved slice.

## Disable Without Evidence Deletion

To disable Hermes, deny new Hermes admission in the later approved runtime
control plane while preserving existing Hermes and Kendall evidence. Do not
delete Hermes or Kendall evidence, remove data, kill processes, alter board
state, or clean up files as part of this preflight posture. Keep provider,
credential, billing, deployment, public network, and gateway capability
disabled.

Only a later explicitly approved story may install/configure Hermes, create a
profile or board, enable a gateway, mount credentials, or admit work.

## Profile Bootstrap Topology

The source-only `hermes-profile-bootstrap` policy renders a plan, never a live
Hermes configuration. It requires an explicit operator-owned runtime root and
creates no directories, processes, credentials, network connections, provider
calls, or delivery actions. Apply mode is intentionally a later, separately
authorized boundary.

When a local Coordinator provisions the corresponding task-scoped capability,
the requested home and workspace must be disjoint direct children of one
existing canonical runtime profile parent. That parent must be owned by the
Supervisor process owner and have no group or other permissions; a conflict
removes only roots created by the losing request unless a matching persisted
binding proves they belong to the exact replay.

The plan has exactly five separate identities and homes below that runtime root:
`Coordinator`, `Developer`, `Reviewer`, `Delivery`, and `Memory`. Each profile
defaults to no network and no credential access. Credential declarations may
name only an adapter class or allowlisted environment-variable *name*; they
never contain, mount, copy, log, or retain credential material.

Developer alone has a bounded write root in its assigned task workspace.
Reviewer receives a separate read-only review root; a shared or nested
Developer/Reviewer root is rejected. Task scope carries its outcome/lane-run
identity, read/write roots, artifact root, forbidden secret/host-credential
paths, no-cleanup rule, rollback-to-Developer rule, and cited-diff capture rule.
All roots must be distinct and non-overlapping so that an artifact/read root
cannot encompass a role home or another role's workspace. The bootstrap accepts
only a matching metadata-only result from the existing Hermes policy classifier;
it does not accept a caller-supplied `ordinary` label or independently classify
cost, audience, or effect.
Delivery is read-only and may request only a future typed adapter operation:
source edits, patch application, and source-repair shells return bounded
rework to the owning Developer lane. Memory is cited-context-only and rejects
uncited, unallowlisted, stale, or revoked context; it never supplies authority.

Provider, billing, real-user deployment, direct GitHub, raw credential, and
cleanup capabilities are denied by the plan. Any spend, real-user deployment,
or uncertain external-impact request is `deniedExternalImpact` before side
effect and remains subject to the existing scoped, expiring decision path.
An unavailable independent Reviewer produces a metadata-only exception
requirement with the outcome/lane-run identifiers, reason, risk class,
compensating-review reference, recorder/time, and review-or-expiry point. It is
not approval and is not persisted by this workflow.

## Verification and Independent Review Handoff

The Supervisor ledger accepts a metadata-only verification record before an
independent review disposition. A record binds the existing Outcome and
Developer lane to an opaque record/idempotency identity, passed/failed/
inconclusive result, cited evidence, and the current source fingerprint. Only
`passed` may enter review; missing, stale, failed, inconclusive, malformed, or
replay-conflicting evidence stops at the ledger boundary.

A local authenticated Coordinator may provision a task-scoped Developer or
Reviewer capability at `/hermes-control-plane/role-capabilities`. The
Supervisor stores only its digest, role, outcome/lane binding, expiry,
revocation state, and provisioner identity; it never returns, logs, or retains
the supplied capability value. Caller-supplied profile fields are compared to
that binding and are not authority. The Developer first records verification
with its capability. Only then may a distinct, non-revoked Reviewer capability
submit a disposition against that exact record. An expired, revoked, stale,
unbound, or replay-conflicting admission fails closed; exact persisted replays
remain available only when their bound metadata can be proven.

The local authenticated control-plane endpoints are deliberately narrow:
`/hermes-control-plane/role-capabilities` provisions one task-scoped binding;
`/hermes-control-plane/role-capability-revocations` revokes that binding; and
`/hermes-control-plane/review-handoffs` accepts only the matching Developer or
Reviewer proof (the unavailable-reviewer exception instead requires the
authenticated Operator session). `/hermes-control-plane/technical-block-recoveries`
also requires the authenticated Operator session, a current blocked projection,
current revisions, and fresh cited evidence; its append-only recovery event
records the authenticated actor identity. The capability, revocation, and
technical-recovery routes require the authenticated Operator session, HTTPS
origin, and CSRF check. Review handoffs require the local trusted transport and
matching role proof; only an unavailable-reviewer exception additionally uses
the Operator session checks. Capability values are never returned or logged. A
conflict fails closed: reprovision a distinct binding for an expired, revoked,
or historical noncanonical path rather than reusing it.

A disposition is exactly `approve`, `rework`, or `technical_block`. It is
atomically bound to that verification record, the original Developer lane, and
distinct Reviewer identity, home, and workspace metadata. Self-review or any
overlap is denied. Approval records only post-review completion: it is not a
GitHub, delivery, merge, provider, or runtime action. Rework returns to the
same recorded Developer lane with cited evidence. A `technical_block` remains
immutable; the Coordinator's typed recovery path may only create a distinct
replacement review lane with fresh metadata-only evidence, exact current
outcome/blocked-lane revisions, and no budget replenishment. It cannot reopen
or overwrite the blocked lane. The unavailable-Reviewer exception remains
audit-only and cannot waive verification or become an approval.
