# Kendall Vnxt Ubuntu Deployment Evidence Schema

Status: draft v1

Evidence records prove what was checked without retaining secrets or unnecessary
machine state.

## Validator Evidence Required Fields

```json
{
  "schema": "kendall-linux-install-evidence/v1",
  "generated_at": "2026-06-16T00:00:00.000Z",
  "mode": "verify",
  "command": {
    "mode": "verify",
    "invoked": "scripts/validate-linux-install.sh --verify-only"
  },
  "target": {
    "alias": "local",
    "user": "linux-user",
    "hostname": "ubuntu-host-or-not-enforced",
    "repo": "$HOME/Kendall_Nxt",
    "repo_url": "https://github.com/slawdawg/Kendall-vnxt.git",
    "minimumOsVersion": "26.04",
    "nodeRange": ">=22 <25",
    "address_source": "local-session"
  },
  "authority": {
    "level": "verify|evidence-write",
    "approval_id": null
  },
  "checks": [
    {
    "id": "os-release",
      "status": "pass|fail|warn|skip|blocked",
      "summary": "Ubuntu 26.04 or later detected"
    },
    {
      "id": "repo-origin",
      "status": "pass|fail",
      "summary": "origin matches expected Kendall Vnxt repo"
    }
  ],
  "mutations": [],
  "redactions": [
    "gh-auth-output",
    "environment",
    "authorized-keys",
    "provider-tokens",
    "private-keys"
  ],
  "manual_tasks": [
    {
      "id": "tailscale-login|codex-login|claude-login|provider-auth",
      "status": "manual-post-install",
      "summary": "Manual post-install auth task"
    }
  ],
  "auth_boundary": {
    "performed_provider_login": false,
    "performed_tailscale_login": false,
    "performed_codex_login": false,
    "performed_claude_login": false,
    "performed_browser_auth": false,
    "read_or_wrote_provider_tokens": false
  },
  "result": "pass|fail|blocked",
  "rerun_guidance": "Safe to rerun or exact failed-check recovery guidance"
}
```

Result consistency rules:

- `pass` evidence must not contain failed checks.
- `fail` evidence must contain at least one failed check.
- `blocked` evidence must contain a blocked check that explains the stop and
  the manual recovery step.
- `checks_summary.pass`, `checks_summary.fail`, and `checks_summary.warn` must
  be non-negative integers matching the actual check rows with those statuses.
- Each `manual_tasks` row must include one of the required manual task IDs,
  `status: "manual-post-install"`, and a non-empty summary.
- `redactions` must include `gh-auth-output`, `environment`,
  `authorized-keys`, `provider-tokens`, and `private-keys`.
- Each `mutations` entry must be a non-empty string. Evidence with
  `authority.level: "evidence-write"` must include `evidence-file`.
- Bootstrap controller evidence authority is limited to `plan`, `verify`, or
  `evidence-write`. Install evidence authority is limited to `verify` or
  `evidence-write`.
- Install evidence must use `target.alias: "local"` and
  `target.address_source: "local-session"`.
- Install evidence must include `command.mode: "verify"` and a non-empty
  `command.invoked` string.

## Bootstrap Controller Evidence Required Fields

The local bootstrap controller writes local evidence using this
shape:

```json
{
  "schema": "kendall-linux-bootstrap-evidence/v1",
  "generated_at": "2026-06-17T00:00:00.000Z",
  "command": {
    "mode": "plan|verify-only",
    "invoked": "node ./scripts/linux-bootstrap.mjs --verify-only"
  },
  "target": {
    "alias": "local",
    "user": "linux-user",
    "hostname": "ubuntu-host-or-not-enforced",
    "repo": "$HOME/Kendall_Nxt",
    "minimumOsVersion": "26.04",
    "nodeRange": ">=22 <25",
    "address_source": "local-session"
  },
  "authority": {
    "level": "plan|verify",
    "approval_id": null
  },
  "gates": [
    {
      "id": "local-preflight",
      "status": "pass|fail|warn|skip|blocked",
      "summary": "local tools and script syntax are ready",
      "recovery": "none",
      "timestamp": "2026-06-17T00:00:00.000Z",
      "command": "redacted command or context summary"
    }
  ],
  "checks": [
    {
      "id": "local-preflight",
      "status": "pass|fail|warn|skip",
      "summary": "local tools and script syntax are ready"
    }
  ],
  "tool_changes": [],
  "project_actions": [],
  "manual_tasks": [
    {
      "id": "tailscale-login",
      "status": "manual-post-install",
      "summary": "Enroll or log in only after base bootstrap if needed"
    }
  ],
  "tool_versions": [
    {
      "id": "node",
      "status": "pass",
      "summary": "v22.22.1"
    }
  ],
  "repo_state": {
    "id": "repo",
    "status": "pass",
    "summary": "repo found at /home/linux-user/Kendall_Nxt on branch main"
  },
  "validation_summary": {
    "pass": 14,
    "fail": 0,
    "warn": 0
  },
  "skipped": [],
  "mutations": ["evidence-file"],
  "redactions": [
    "gh-auth-output",
    "environment",
    "authorized-keys",
    "provider-tokens",
    "private-keys"
  ],
  "auth_boundary": {
    "performed_provider_login": false,
    "performed_tailscale_login": false,
    "performed_codex_login": false,
    "performed_claude_login": false,
    "performed_browser_auth": false,
    "read_or_wrote_provider_tokens": false
  },
  "result": "pass|fail|blocked",
  "rerun_guidance": "Safe to rerun or exact failed-gate recovery guidance"
}
```

Bootstrap `--plan` must not write an evidence file. It emits a redacted JSON
plan to stdout only because plan mode must not mutate local state. Blocked
gates, such as missing private repo access, must produce `result: "blocked"`
rather than being flattened to an ordinary failure.

Bootstrap action rows in `tool_changes` and `project_actions` must be objects
with non-empty `id`, `status`, and `summary`. `skipped` rows must be objects
with non-empty `id` and `reason`, and `status` must be `skip` or `blocked`.

## Allowed Detail

Evidence may include:

- Tool names and versions.
- Exit codes.
- Short redacted summaries.
- Local host name.
- Repo path, expected repo URL, origin-match status, and branch name.

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
files with the local alias, mode, and UTC timestamp. File evidence uses the
`evidence-write` authority level and records an `evidence-file` mutation.
