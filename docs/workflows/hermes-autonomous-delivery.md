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

## Governed Delivery Commands

Story 4.2's Delivery adapter records metadata-only admission evidence; it never
contains a GitHub token or a direct GitHub client. An accepted `request_review`
or `merge` audit mints one short-lived exact action/head admission. The local,
private-UDS-only `/internal/hermes-control-plane/delivery-admissions/consume`
operation atomically revalidates and consumes that admission using the existing
task-scoped Delivery capability proof. It returns the same metadata-only result
only for an exact current replay. The proof is read only from the protected
local process environment (`KENDALL_HERMES_DELIVERY_CAPABILITY_PROOF`); it is
never accepted on the command line or persisted. A conflicting, expired,
revoked, already-claimed, stale, or changed task/action/PR/head request is a
stop line: create a fresh audit after proving current verification/review state,
rather than retrying a GitHub mutation.

An admission also binds the audited Delivery identity, profile, capability
binding, and—only for `request_review`—the exact reviewer login. The executor
rejects any mismatch before GitHub. If a pre-mutation claim ages beyond the
short admission TTL without an immutable mutation-attempt result, it retains a
metadata-only supersession record and can make one fresh private-UDS claim; the
Supervisor still requires a new current unclaimed audit admission.

Historical delivery payloads remain strict, readable V1 records. New
reviewer-bound audit, result, claim, and receipt payloads use their explicit V2
schema markers; do not add reviewer fields to a V1 replay or downgrade a V2
operation to bypass reviewer binding.

The runner resolves the private endpoint only at the source-owned local
operating-system account home `kendall-lan-auth/supervisor.sock`; delivery-time
`HOME`, socket, and LAN-auth-directory environment overrides are deliberately
ignored. Test fixtures may inject a private socket through their in-process test
context only.

The server-owned consumption result is evidence, not a credential or direct
GitHub input. The governed workspace executor invokes the private UDS operation
under its manifest lock immediately before the GitHub write, retains only the
returned metadata identifiers, and independently re-audits the managed task,
repository, PR, and exact head. Do not invoke the commands below without
separately established governed lane authority and the already-provisioned
Delivery capability binding/profile arguments:

```bash
node ./scripts/codex-workspace.mjs request-pr-review <task> --reviewer <login> --expected-head <40-char-sha> --hermes-outcome-id <id> --hermes-lane-run-id <id> --hermes-delivery-steward-identity <id> --hermes-delivery-home <path> --hermes-delivery-workspace <path> --hermes-delivery-capability-binding-id <id>
node ./scripts/codex-workspace.mjs merge-exact-head <task> --expected-head <40-char-sha> --hermes-outcome-id <id> --hermes-lane-run-id <id> --hermes-delivery-steward-identity <id> --hermes-delivery-home <path> --hermes-delivery-workspace <path> --hermes-delivery-capability-binding-id <id>
```

Both commands reject a missing private-UDS transport, Delivery proof, expired,
revoked, duplicate, stale, or mismatched admission, then re-prove the managed
task, repository, pull request, and exact head before the GitHub operation and
again under the manifest lock. They reject draft,
stale, changed, or non-mergeable PR state. `merge-exact-head` requires the
retained exact-head merge gate and does not clean up. A failed post-mutation
audit is a stop line: do not retry blindly; retain the error and inspect the PR
state before any separately governed recovery or revert decision.

The adapter contract is selected by `pnpm run test:hermes-delivery-adapter` and
the `check:fast` local-verification group. It uses fixtures only and does not
request review, merge, invoke a provider, expose credentials, or alter a PR.

## Profile Bootstrap Topology

The source-only `hermes-profile-bootstrap` policy renders a plan, never a live
Hermes configuration. It requires an explicit operator-owned runtime root and
creates no directories, processes, credentials, network connections, provider
calls, or delivery actions. Apply mode is intentionally a later, separately
authorized boundary.

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
