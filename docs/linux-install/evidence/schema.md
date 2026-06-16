# Kendall Vnxt Ubuntu Deployment Evidence Schema

Status: draft v1

Evidence records prove what was checked without retaining secrets or unnecessary
machine state.

## Required Fields

```json
{
  "schema": "kendall-linux-install-evidence/v1",
  "generated_at": "2026-06-16T00:00:00.000Z",
  "mode": "plan|verify|apply|post-apply",
  "target": {
    "alias": "ubuntu-target",
    "user": "linux-user",
    "hostname": "ubuntu-host-or-not-enforced",
    "repo": "$HOME/Kendall_Nxt",
    "minimumOsVersion": "26.04",
    "nodeRange": ">=22 <25",
    "address_source": "ssh-config|operator-input|discovery"
  },
  "authority": {
    "level": "plan|verify|evidence-write|apply|reboot|cleanup",
    "approval_id": null
  },
  "checks": [
    {
      "id": "os-release",
      "status": "pass|fail|warn|skip",
      "summary": "Ubuntu 26.04 or later detected"
    }
  ],
  "mutations": [],
  "redactions": [
    "gh-auth-output",
    "environment",
    "authorized-keys"
  ],
  "result": "pass|fail|blocked"
}
```

## Allowed Detail

Evidence may include:

- Tool names and versions.
- Exit codes.
- Short redacted summaries.
- Public key fingerprints.
- Host aliases and approved host-key fingerprints.
- Repo path and branch name.

## Forbidden Detail

Evidence must not include:

- Private keys or private key paths containing key material.
- Tokens, auth URLs, OAuth device codes, or credential helper output.
- Token scopes.
- Full environment dumps.
- Shell history.
- Full `authorized_keys`.
- Broad home-directory listings.
- Raw provider payloads, prompts, completions, or reasoning traces.

## File Location

First-milestone scripts default to stdout-only summaries. If file evidence is
enabled with `--evidence`, write under `docs/linux-install/evidence/` and name
files with the target alias, mode, and UTC timestamp. File evidence uses the
`evidence-write` authority level and records an `evidence-file` mutation.
