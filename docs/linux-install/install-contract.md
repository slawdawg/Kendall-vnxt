# Linux Install Contract

Status: draft v1
Target v1: Ubuntu 26.04 LTS, existing `slaw_dawg` user, host identity `Kendall_vNxt`

## Purpose

This contract defines the boundary for a repeatable Kendall_Nxt Linux install
and bootstrap flow. It is the authority layer for the playbook, scripts, and
future one-command bootstrap.

## Supported Target

Version 1 supports exactly this target:

- Ubuntu 26.04 LTS.
- Operator-created VM with display identity `Kendall_vNxt`.
- Existing local user `slaw_dawg`.
- Stable operator alias `kendall-linux`.
- VM/display hostname target `Kendall_vNxt`.
- Public-key SSH access only.
- Manual GitHub authentication only.

The observed IP address can change and is not a durable install target.

## Authority Levels

| Level | Scope | Allowed now |
| --- | --- | --- |
| Plan | Print intended checks and stop lines | Yes |
| Verify | Read-only local or remote checks | Yes after target is named |
| Apply | Install packages, edit files, change services, change SSH state | No |
| Reboot | Restart the VM or host | No |
| Cleanup | Remove files, keys, packages, or evidence | No |

Apply, reboot, and cleanup require a separate approval packet from
[remote-approval-template.md](remote-approval-template.md).

VM creation is an operator prerequisite for v1. The bootstrap scripts do not
create VMs, create Linux users, or modify hypervisor settings.

## Hard Stop Lines

Automation must stop before:

- Installing, upgrading, or removing packages.
- Editing SSH server configuration.
- Replacing `authorized_keys`.
- Copying, reading, printing, or moving a private key.
- Running `gh auth login`, device-code flows, browser auth, token imports, or
  credential helper writes.
- Rebooting or shutting down the VM.
- Using a raw IP address as the durable target identity.
- Continuing after host-key or target-user mismatch.
- Replacing an existing SSH host key without manual investigation.
- Writing evidence that includes secrets, raw credential output, shell history,
  broad environment dumps, or broad home-directory listings.

## SSH Key Contract

The private key stays on the operator host. The Linux target may receive only a
public key line. Any future key install mode must append to `authorized_keys`,
preserve a backup, verify permissions, and prove a new SSH login succeeds before
any optional password-login hardening is considered.

## GitHub Auth Contract

Bootstrap may install or verify `gh`, but GitHub login remains manual. Scripts
may check whether `gh auth status` succeeds, but they must not print raw auth
output or retain token scopes in evidence.

## Evidence Contract

Evidence must follow [evidence/schema.md](evidence/schema.md). The default
behavior for first-milestone scripts is stdout-only redacted evidence. File
evidence requires an explicit path and must stay inside repo-approved evidence
storage.

## Completion Criteria

A Linux install is considered proven only when:

- The target identity is resolved through `kendall-linux`.
- First SSH trust has recorded a new host key or matched an existing trusted
  host key without replacement.
- The VM exists and was created with the expected Ubuntu version, VM/display
  identity, network reachability, and `slaw_dawg` user.
- The remote user is `slaw_dawg`.
- Ubuntu release is 26.04.
- Node, pnpm, uv, gh, git, and SSH checks pass.
- The Kendall_Nxt repo is present and passes the agreed verification command.
- GitHub auth is either valid or explicitly marked as a manual pending step.
- Evidence is redacted and linked from the playbook.
- No stop line was crossed without a matching approval packet.

## Documentation Feedback Loop

When a command, assumption, or operator step fails during the install, update
the playbook or [lessons-learned.md](lessons-learned.md) in the same work pass.
The install path is not considered repeatable if known mistakes remain only in
chat history.
