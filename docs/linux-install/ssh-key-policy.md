# SSH Key Policy

Status: historical/superseded for installer scope

Superseded for Kendall Vnxt install by:

- [one-command-bootstrap-plan.md](one-command-bootstrap-plan.md)
- [install-contract.md](install-contract.md)

This document is retained as SSH policy history only. SSH setup, remote
execution, terminal transport, and SSH host-key management are not part of the
supported v1 Kendall Vnxt installer. The only supported v1 install method is a
local Ubuntu 26.04-or-later non-root sudo user running the single Kendall Vnxt
bootstrap command from that Ubuntu terminal.

## Principle

Only the public key is eligible to move to the Ubuntu host. The private key
remains on the operator host and must never be copied, printed, retained in
evidence, or sent through a bootstrap script.

## Target Identity

Use a stable SSH alias or host name for routine automation. An observed IP
address is discovery evidence only and can change.

Before any future remote mutation, automation must confirm:

- Target alias or host name is the operator-approved target.
- Remote user is the intended non-root Linux user.
- Host key matches the operator-approved known host.
- The target presents the expected Ubuntu host identity.

The first SSH connection to a newly prepared host may use
`StrictHostKeyChecking=accept-new` after the operator confirms the IP, DNS name,
or local name belongs to the intended Ubuntu host. This is a
trust-establishment step. It may add a new host key to `known_hosts`, but it
must not replace an existing host key without manual investigation.

## Public Key Install Rules

The Ubuntu installer's "Import SSH keys from GitHub" option is allowed for host
login setup. It imports public keys from the selected GitHub account into the
Linux user's `authorized_keys`. It is not GitHub repo authentication and it
must not be treated as permission for scripted GitHub login.

Any future key install mode must:

- Accept public-key material only.
- Reject private-key-looking input.
- Create a timestamped backup of `~/.ssh/authorized_keys` before modification.
- Append the key only if it is not already present.
- Preserve existing authorized keys.
- Set `~/.ssh` to `700` and `authorized_keys` to `600`.
- Verify a new SSH login works before reporting success.
- Avoid disabling password login unless a separate hardening approval exists.

## Evidence Rules

Evidence may record:

- Public key fingerprint.
- Target alias.
- Remote username.
- Host-key fingerprint after operator-approved trust establishment.
- Whether key-based login succeeded.

Evidence must not record:

- Private key path contents.
- Raw private key material.
- Complete `authorized_keys` content.
- SSH agent key listings with sensitive comments unless redacted.
- Full SSH debug logs.
