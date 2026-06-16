# SSH Key Policy

Status: draft v1

## Principle

Only the public key is eligible to move to the Linux VM. The private key remains
on the operator host and must never be copied, printed, retained in evidence, or
sent through a bootstrap script.

## Target Identity

Use the SSH alias `kendall-linux` for routine automation. The observed IP
address, such as `192.168.1.6`, is discovery evidence only and can change.

Before any future remote mutation, automation must confirm:

- Target alias is `kendall-linux` unless Bob approves a temporary override.
- Remote user is `slaw_dawg`.
- Host key matches the operator-approved known host.
- The target presents the expected Ubuntu VM identity.

The first SSH connection to a newly created VM may use
`StrictHostKeyChecking=accept-new` after Bob confirms the IP or local name
belongs to `Kendall_vNxt`. This is a trust-establishment step. It may add a new
host key to `known_hosts`, but it must not replace an existing host key without
manual investigation.

## Public Key Install Rules

The Ubuntu installer's "Import SSH keys from GitHub" option is allowed for VM
login setup. It imports public keys from Bob's GitHub account into the Linux
user's `authorized_keys`. It is not GitHub repo authentication and it must not
be treated as permission for scripted GitHub login.

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
- Host-key fingerprint after Bob-approved trust establishment.
- Whether key-based login succeeded.

Evidence must not record:

- Private key path contents.
- Raw private key material.
- Complete `authorized_keys` content.
- SSH agent key listings with sensitive comments unless redacted.
- Full SSH debug logs.
