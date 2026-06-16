# Provider Login Policy

Status: active baseline policy
Date: 2026-06-16

## Purpose

Define how provider CLIs are handled on the Linux baseline VM.

Authentication is not part of the base Linux VM bootstrap. The bootstrap may
install tools and prove they run, but login is a post-deployment user action
performed only when a workflow needs that provider or repository service.

## Installed CLIs

The Linux baseline requires these CLIs on PATH:

- GitHub CLI: `gh`
- Codex CLI: `codex`
- Claude Code: `claude`

Installing a CLI is not the same as authorizing provider use.

The base bootstrap is complete even when these tools are not authenticated.

## Auth Boundary

Allowed:

- Bob may perform interactive provider login from the VM terminal after
  deployment when a workflow needs it.
- Codex may verify whether a provider CLI exists.
- Codex may run redacted auth-status probes such as
  `gh auth status >/dev/null` to report `valid`, `pending`, or
  `not configured`. A pending or missing auth result is not a bootstrap failure.
- Codex may verify private GitHub repo access with a non-interactive
  `git ls-remote` probe only after Bob has configured the required auth.

Not allowed without separate approval:

- Automated OpenAI login.
- Automated Anthropic login.
- Automated GitHub login.
- Treating missing auth as a base bootstrap failure.
- Token import or token file manipulation.
- Copying provider credential state between hosts.
- Printing, storing, or retaining API keys, refresh tokens, OAuth device codes,
  provider auth URLs, or credential helper output.
- Provider calls, paid usage, or agent execution.

## Manual Login Rule

When Codex or Claude requires login, Bob performs it interactively inside the
VM. Before or after login, verification should record only:

- CLI command exists.
- Redacted auth status if the CLI provides a safe check, including pending or
  not-configured state.
- Provider action was manually completed by Bob.
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
