# Kendall Vnxt Ubuntu Deployment Contract

Status: draft v1
Target v1: Ubuntu 26.04 LTS or later, existing non-root Linux user

## Purpose

This contract defines the boundary for a repeatable Kendall Vnxt deployment
and bootstrap flow on Ubuntu 26.04 or later. It is the authority layer for the
playbook, scripts, and future one-command bootstrap.

## Supported Target

Version 1 supports this target shape:

- Ubuntu 26.04 LTS or later.
- Physical machine, VM, or cloud host.
- Existing non-root Linux user.
- Direct console/local terminal access, or a stable SSH target alias or host
  name when using the remote operator path.
- Optional expected hostname when the operator wants to enforce it.
- Public-key SSH access only when SSH is used.
- No provider login is required for the base bootstrap.
- Private GitHub repository access may require manual user-performed GitHub
  auth before clone.

Raw IP addresses can change and are not durable install targets.

## Authority Levels

| Level | Scope | Allowed now |
| --- | --- | --- |
| Plan | Print intended checks and stop lines | Yes |
| Verify | Read-only local or remote checks | Yes after target is named |
| Evidence write | Write redacted evidence under approved repo evidence paths | Yes when explicit |
| Manual repo auth | User-performed GitHub auth for private repo clone | Yes when repo access requires it |
| Apply | Install packages, edit files, change services, change SSH state | No |
| Reboot | Restart the VM or host | No |
| Cleanup | Remove files, keys, packages, or evidence | No |

Apply, reboot, and cleanup require a separate approval packet from
[remote-approval-template.md](remote-approval-template.md).

Machine creation is an operator prerequisite for v1. The bootstrap scripts do
not create VMs, create Linux users, provision cloud hosts, or modify hypervisor
settings.

## Hard Stop Lines

Automation must stop before:

- Installing, upgrading, or removing packages.
- Editing SSH server configuration.
- Replacing `authorized_keys`.
- Copying, reading, printing, or moving a private key.
- Automating `gh auth login`, device-code flows, browser auth, token imports,
  or credential helper writes.
- Rebooting or shutting down the machine.
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

## Auth Contract

Bootstrap may install CLIs such as `gh`, `codex`, and `claude`, but it must not
authenticate them. GitHub repository access auth is user-performed and may be a
manual pre-clone deployment step when the Kendall Vnxt repository is private.
OpenAI/Codex, Anthropic/Claude, Tailscale, and other provider login remain
user-performed post-deployment steps only when a workflow actually needs that
service.

Scripts may report whether an auth check is valid, pending, or not configured,
but missing auth must not fail the base bootstrap. Evidence must not print
raw auth output, token scopes, auth URLs, device codes, credential helper
output, or token values.

## Evidence Contract

Evidence must follow [evidence/schema.md](evidence/schema.md). The default
behavior for first-milestone scripts is stdout-only redacted evidence. File
evidence requires an explicit path and must stay inside repo-approved evidence
storage.

## Completion Criteria

A Kendall Vnxt Ubuntu deployment is considered proven only when:

- The machine exists with Ubuntu 26.04 or later and the intended non-root Linux
  user.
- Direct local-terminal access is available, or the target identity is resolved
  through the operator's chosen stable SSH alias or host name when using SSH.
- First SSH trust has recorded a new host key or matched an existing trusted
  host key without replacement when using SSH.
- The remote user matches the operator-provided `--user` when that flag is
  used; otherwise the current remote user is accepted.
- Ubuntu release is 26.04 or later.
- Node satisfies the repo engine range, pnpm matches the repo-pinned version,
  and required tools such as uv, gh, and git pass version checks.
- The Kendall Vnxt repo checkout is present and passes the agreed verification
  command.
- Any provider or repository-service auth is either absent or user-configured
  after deployment; auth absence does not fail the base bootstrap.
- Evidence is redacted and linked from the playbook.
- No stop line was crossed without a matching approval packet.

## Documentation Feedback Loop

When a command, assumption, or operator step fails during the install, update
the playbook or [lessons-learned.md](lessons-learned.md) in the same work pass.
The install path is not considered repeatable if known mistakes remain only in
chat history.
