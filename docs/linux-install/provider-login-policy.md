# Provider Login Policy

Status: active baseline policy
Date: 2026-06-16

## Purpose

Define how provider CLIs are handled when Kendall Vnxt is deployed on an
Ubuntu/Linux host.

Authentication is not part of the base Linux bootstrap. The bootstrap may
install tools and prove they run. Private GitHub repo access auth is a manual
user action before clone when the repo is private. OpenAI, Anthropic,
Tailscale, and other provider login remain post-deployment user actions
performed only when a workflow needs that provider.

## Installed CLIs

The Kendall Vnxt Ubuntu deployment baseline requires these CLIs on PATH:

- GitHub CLI: `gh`
- Codex CLI: `codex`
- Claude Code: `claude`

Tailscale may be installed as an access hardening tool, but Tailnet enrollment
is governed by the same post-deployment auth boundary.

Installing a CLI is not the same as authorizing provider use.

The base bootstrap is complete even when these tools are not authenticated.

## Auth Boundary

Allowed:

- The user may perform interactive provider login from the Ubuntu host terminal after
  deployment when a workflow needs it.
- The user may perform `gh auth login` manually before clone when private
  Kendall Vnxt repo access requires it.
- Codex may verify whether a provider CLI exists.
- Codex may run redacted auth-status probes such as
  `gh auth status >/dev/null` to report `valid`, `pending`, or
  `not configured`. A pending or missing auth result is not a bootstrap failure.
- Codex may verify private GitHub repo access with a non-interactive
  `git ls-remote` probe only after the user has configured the required auth.

Not allowed without separate approval:

- Automated OpenAI login.
- Automated Anthropic login.
- Automated GitHub login.
- Automated Tailscale login or Tailnet enrollment.
- Treating missing auth as a base bootstrap failure.
- Token import or token file manipulation.
- Copying provider credential state between hosts.
- Printing, storing, or retaining API keys, refresh tokens, OAuth device codes,
  provider auth URLs, or credential helper output.
- Provider calls, paid usage, or agent execution.

## Manual Login Rule

When Codex or Claude requires login, the user performs it interactively inside the
host. Before or after login, verification should record only:

- CLI command exists.
- Redacted auth status if the CLI provides a safe check, including pending or
  not-configured state.
- Provider action was manually completed by the user.
- No token details retained.

## Evidence Rule

Evidence must never include:

- OpenAI API keys.
- Anthropic API keys.
- OAuth refresh/access tokens.
- Device codes.
- Browser auth URLs.
- Raw CLI credential files.
- Raw provider payloads, prompts, completions, or reasoning traces.

Provider CLI install evidence may include version strings.
