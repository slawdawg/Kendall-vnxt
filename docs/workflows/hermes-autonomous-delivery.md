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
