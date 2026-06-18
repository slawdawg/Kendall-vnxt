# Kendall Vnxt Ubuntu Deployment Troubleshooting

Status: draft v1

Use symptom-first checks. Avoid broad diagnostics that leak secrets, such as
full environment dumps, shell history, credential helper output, token values,
auth URLs, or full home-directory listings.

The only supported v1 install method is the single local bootstrap command run
inside Ubuntu by a non-root sudo user. Do not switch to SSH, remote execution,
staged scripts, or manual multi-step install as a workaround.

## Ubuntu Host Does Not Exist Yet

Symptom: there is no Ubuntu machine where the installer can run.

Fix:

- Prepare a physical machine, VM, or cloud host using
  [install-playbook.md](install-playbook.md).
- Install Ubuntu 26.04 LTS or later.
- Create or confirm the intended non-root Linux user with sudo permissions.
- Log in locally as that user.
- Run the single bootstrap command from the local Ubuntu terminal.

## Bootstrap Script Download Fails

Symptom: the README command cannot download `/tmp/kendall-vnxt-bootstrap.sh`.

Checks:

```bash
command -v curl || true
command -v wget || true
getent hosts raw.githubusercontent.com
```

Fix:

- Confirm the host has outbound internet and DNS.
- If neither `curl` nor `wget` exists, the README command should install
  `curl` and `ca-certificates` with sudo before downloading.
- If the raw GitHub URL returns `404`, the installer changes are not published
  to the documented source yet, or the repository is private to the installer
  audience.
- Do not replace the install path with a manual multi-step script sequence.
  Publish an accessible bootstrap source or use an explicitly labeled
  pre-merge proof source.

## Wrong User

Symptom: the script reports the current user is wrong or `root` is not
supported.

Fix:

- Stop the install.
- Log in as the intended non-root Linux user.
- Do not run the bootstrap with `sudo bash ...`.
- Do not let bootstrap create users in v1.

## Wrong Ubuntu Version

Symptom: `/etc/os-release` is older than Ubuntu 26.04 or not Ubuntu.

Fix:

- Stop the v1 path.
- Recreate or upgrade the host to Ubuntu 26.04 LTS or later, or create a new
  contract for the other distro/version.

## Sudo Requires A Password

Symptom:

```text
sudo: interactive authentication is required
```

or the script asks for a password.

Fix:

- Continue only from an interactive local Ubuntu terminal.
- Enter the Linux user's sudo password when prompted.
- Do not send the sudo password through chat, scripts, logs, or evidence.
- Do not make passwordless sudo the default.

## Sudo Is Missing

Symptom: the script reports `sudo` is unavailable.

Fix:

- Stop before package mutation.
- Use a local administrator path to install sudo or recreate the Ubuntu host
  with the intended user in the sudo group.
- Rerun the same single bootstrap command after sudo is available.

## Node Version Is Unsupported

Symptom: the script reports Node is outside `>=22 <25`.

Fix:

- Stop and record the package result.
- Do not continue with unsupported Node.
- Update the bootstrap script to install an approved Node channel for Ubuntu
  26.04, then rerun the same single bootstrap command.
- Do not manually install a different Node channel as an undocumented
  workaround for feature-complete proof.
- Record the lesson in [lessons-learned.md](lessons-learned.md).

## GitHub Repo Access Missing

Symptom: the script reports repo access is unavailable.

Fix:

- If the repo is private, the user completes GitHub auth manually from the
  local Ubuntu terminal.
- Do not automate `gh auth login`.
- Do not paste tokens into scripts, chat, logs, or evidence.
- After auth, rerun the same single bootstrap command.

Verify access without retaining raw credential output:

```bash
gh auth status >/dev/null 2>&1 && echo gh-auth-ok
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

## Clone Target Already Exists

Symptom: `$HOME/Kendall_Nxt` already exists but is not a Git checkout.

Fix:

- Stop before replacing it.
- Inspect with:

```bash
ls -ld "$HOME/Kendall_Nxt"
```

- Do not delete or overwrite the path without a separate cleanup approval.
- After cleanup is approved and completed, rerun the same single bootstrap
  command.

If `$HOME/Kendall_Nxt/.git` exists, the bootstrap should validate that repo
instead of destructively replacing it.

## Project Setup Fails

Symptom: `pnpm run setup` fails.

Fix:

- Keep the failed terminal summary.
- Do not switch to a manual install sequence.
- Fix the root cause in the repo or bootstrap script.
- Rerun the same single bootstrap command.

## Evidence Was Not Written

Symptom: the command exits successfully but no `local-install-*.json` exists
under:

```text
$HOME/Kendall_Nxt/docs/linux-install/evidence/
```

Fix:

- Treat the proof as incomplete.
- Confirm the repo checkout contains `docs/linux-install/evidence/`.
- Rerun the same single bootstrap command after fixing the script.

## Evidence Validation Fails

Symptom:

```bash
pnpm run check:linux-bootstrap-evidence -- docs/linux-install/evidence/<file>.json
```

fails.

Fix:

- Do not promote the evidence packet.
- Fix the schema mismatch or missing field in the script.
- Rerun the same single bootstrap command and validate the new evidence file.

## Evidence Path Is Rejected

Symptom:

```text
Evidence path must be under this checkout docs/linux-install/evidence
```

Fix:

- Use a file path directly under `docs/linux-install/evidence/` in the current
  checkout.
- Do not use absolute paths, path traversal, symlinks, or parent directories for
  retained install evidence.
- If the file already exists, choose a new evidence filename. Do not overwrite
  existing proof packets.

Command family:

```bash
scripts/validate-linux-install.sh --verify-only --evidence docs/linux-install/evidence/<new-file>.json
```

## Blocked Repo Access Evidence Is Not Parseable

Symptom: repo access is blocked before checkout availability, but stdout cannot
be parsed as a single JSON evidence packet.

Fix:

- Keep progress logs on stderr.
- Keep blocked evidence as the only stdout payload for the blocked helper path.
- Validate the blocked packet with:

```bash
node ./scripts/check-linux-bootstrap-evidence.mjs <captured-blocked-evidence>.json
```

Command family: `scripts/bootstrap-linux.sh --install-kendall-vnxt`.

## Evidence Contains Sensitive Data

Symptom: output includes tokens, auth URLs, shell history, environment dumps,
credential helper output, private keys, or broad home-directory listings.

Fix:

- Stop using that evidence packet.
- Redact or delete the sensitive artifact according to the approved retention
  policy.
- Fix the script before running it again.

## Final Validation Fails After Setup

Symptom: `scripts/bootstrap-linux.sh --install-kendall-vnxt` reaches final
validation but exits with a message pointing at an evidence file.

Fix:

- Inspect the evidence packet named in the error.
- Fix the failed checks reported by `scripts/validate-linux-install.sh`.
- Rerun the same single bootstrap command.
- Do not report install success until final validation passes.

## Provider Or Tailscale Login Is Missing

Symptom: Codex, Claude, provider calls, or Tailscale are not authenticated.

Fix:

- Do not treat this as a base bootstrap failure.
- Those logins are post-install user tasks only when a later workflow needs
  them.
- Do not automate those login flows in the bootstrap script.
