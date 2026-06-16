# Kendall Vnxt Ubuntu Deployment Troubleshooting

Status: draft v1

Use symptom-first checks. Avoid broad diagnostics that leak secrets, such as
full environment dumps, shell history, full SSH debug logs, credential helper
output, or full home-directory listings.

## Ubuntu Host Does Not Exist Yet

Symptom: SSH target cannot be verified because no Ubuntu host has been
prepared.

Fix:

- Prepare a physical machine, VM, or cloud host using `install-playbook.md`.
- Record the host identity, OS hostname, and SSH target alias or host name.
- Create or confirm the intended non-root Linux user.
- Enable SSH.
- Install only the public key.
- Configure a stable SSH alias or host name for routine commands.

## SSH Alias Fails

Symptom: `ssh <ssh-alias>` cannot resolve or connect.

Check:

```powershell
ssh -G <ssh-alias>
```

Fix:

- Update only the `HostName` field in the operator host SSH config.
- Prefer a DHCP reservation, local DNS name, or approved stable network name.
- Do not rewrite playbook commands to use raw IP addresses.

## Host Key Changed

Symptom: SSH warns that the host identification changed.

Fix:

- Stop automation.
- Confirm whether the host was recreated, reinstalled, or assigned a different
  address.
- Verify the target through the console, host manager, cloud console, or router
  before changing
  `known_hosts`.

## First SSH Connection Hangs Or Prompts

Symptom: the first non-interactive `ssh <ssh-alias> ...` command hangs or
waits for host-key confirmation.

Fix:

- Confirm the IP, DNS name, or stable local name belongs to the intended
  Ubuntu host.
- Run the first trust command:

```powershell
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes <ssh-alias> 'whoami; hostname; cat /etc/os-release'
```

- Use normal `ssh <ssh-alias> ...` commands after the host key is recorded.
- Stop if SSH reports a changed host key instead of a new host key.

## PowerShell Rejects Script Redirection

Symptom: PowerShell reports:

```text
The '<' operator is reserved for future use.
```

Cause: Bash-style input redirection was used from the Windows operator host.

Fix:

- Stream the script with `Get-Content -Raw`:

```powershell
Get-Content -Raw scripts\validate-linux-install.sh | ssh <ssh-alias> 'bash -s -- --verify-only --skip-repo'
```

- Use Bash redirection only inside a Bash shell, not in PowerShell examples.

## Wrong User

Symptom: `whoami` is not the intended Linux user.

Fix:

- Stop automation.
- Correct the `User` field under the SSH alias.
- Do not let bootstrap create users in v1.

## Wrong Ubuntu Version

Symptom: `/etc/os-release` is older than Ubuntu 26.04.

Fix:

- Stop the v1 path.
- Recreate or upgrade the host to Ubuntu 26.04 LTS or later, or create a new
  contract for the other distro/version.

## Public Key Login Fails

Symptom: SSH prompts for a password or rejects the key.

Check from the host console:

```bash
ls -ld "$HOME/.ssh"
ls -l "$HOME/.ssh/authorized_keys"
```

Fix:

- Confirm the public key was appended, not overwritten.
- Set `.ssh` to `700`.
- Set `authorized_keys` to `600`.
- Set owner to the intended Linux user.
- Do not copy the private key into the Ubuntu host.

## GitHub Auth Missing

Symptom: `gh auth status` fails.

Fix:

- Do not treat this as a base bootstrap failure.
- Treat this as a post-deployment user step only when the current workflow
  needs private GitHub access.
- Run GitHub auth interactively only by the user from the Ubuntu host terminal.
- Do not paste tokens into bootstrap scripts or evidence.

Verify after login with:

```bash
gh auth status >/dev/null 2>&1 && echo gh-auth-ok
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

Stop before clone if the private repo probe fails.

## Clone Target Already Exists

Symptom: `$HOME/Kendall_Nxt` already exists before clone.

Fix:

- Stop before replacing it.
- Inspect with:

```bash
ls -ld "$HOME/Kendall_Nxt"
git -C "$HOME/Kendall_Nxt" remote -v
git -C "$HOME/Kendall_Nxt" status --short --branch
```

- Do not delete or overwrite the path without a separate cleanup approval.

## Sudo Requires A Password

Symptom:

```text
sudo: interactive authentication is required
```

Cause: the fresh Ubuntu user can use sudo only with an interactive password
prompt. Non-interactive SSH automation cannot run apt safely.

Fix:

- Stop before package mutation.
- Choose one approved path:
  - Run the apt install command manually in the host console.
  - Open an interactive SSH terminal and enter the sudo password there.
  - Stage and run `scripts/bootstrap-linux.sh --install-toolchain` through
    `ssh -t`.
  - Use a documented user-local toolchain install path for tools that do not
    require apt.
  - Temporarily approve a privilege change, then remove it after verification.

Do not send the sudo password through chat, scripts, logs, or evidence.

## Reboot Requires A Password

Symptom:

```text
sudo: interactive authentication is required
```

when attempting reboot proof.

Fix:

- Stop automation.
- Run the reboot from the host console or an interactive SSH session:

```bash
sudo reboot
```

- After the host comes back, run the post-reboot verification from the Windows
  operator host.

## Can Sudo Be Non-Interactive?

Yes, but only by changing the privilege model. Options:

- `sudo -v` caches credentials after an interactive password prompt. This is
  acceptable for a short interactive install session.
- A temporary sudoers rule can allow passwordless commands, but that is a
  security-sensitive remote-write change and needs a separate approval plus a
  cleanup step.
- `SUDO_ASKPASS` can provide a password programmatically, but it risks exposing
  credentials and is not approved for this playbook.

Default v1 behavior: use an interactive terminal for sudo prompts. Do not make
passwordless sudo the default.

## Evidence Contains Sensitive Data

Symptom: output includes tokens, auth URLs, shell history, environment dumps,
credential helper output, full SSH logs, or full `authorized_keys`.

Fix:

- Stop using that evidence packet.
- Redact or delete the sensitive artifact according to the approved retention
  policy.
- Fix the script before running it again.
