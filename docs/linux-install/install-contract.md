# Kendall Vnxt Ubuntu Deployment Contract

Status: draft v1
Target v1: Ubuntu 26.04 LTS or later, existing non-root Linux user with sudo

## Purpose

This contract defines the boundary for a repeatable Kendall Vnxt deployment on
Ubuntu 26.04 or later. It is the authority layer for the README, playbook,
scripts, validation matrix, and evidence.

## Supported Target

Version 1 supports this target shape:

- Ubuntu 26.04 LTS or later.
- Physical machine, VM, or cloud host.
- Existing non-root Linux user with sudo permissions.
- Local interactive terminal access as that Linux user.
- Private GitHub repository access may require manual user-performed GitHub
  auth before clone.

There is only one supported install method: the local Linux user runs the
single Kendall Vnxt bootstrap script from the Ubuntu session. No SSH-driven
install, remote operator install, staged script workflow, manual fallback
install, or Windows-to-Linux orchestration is supported.

## Authority Levels

| Level | Scope | Allowed now |
| --- | --- | --- |
| Plan | Print intended checks and stop lines | Yes |
| Verify | Read-only local checks | Yes |
| Evidence write | Write redacted evidence under approved repo evidence paths | Yes when explicit |
| Manual repo auth | User-performed GitHub auth for private repo clone | Yes when repo access requires it |
| Apply | Install approved packages/tools, clone or validate repo, run setup, and write evidence | Yes only through the single local bootstrap command |
| Reboot | Restart the host | No, separate local user approval |
| Cleanup | Remove files, keys, packages, or evidence | No, separate approval |

Machine creation is a prerequisite for v1. The bootstrap script does not create
VMs, create Linux users, provision cloud hosts, or modify hypervisor settings.

## Hard Stop Lines

Automation must stop before:

- Running as `root`.
- Continuing on a non-Ubuntu or pre-26.04 host.
- Continuing when sudo is missing.
- Continuing when the repo path exists but is not a Git checkout.
- Continuing when the repo path has no `origin` remote or its `origin` remote
  does not match the expected Kendall Vnxt repo URL.
- Automating `gh auth login`, device-code flows, browser auth, token imports,
  or credential helper writes.
- Authenticating OpenAI/Codex, Anthropic/Claude, Tailscale, or any provider.
- Copying, reading, printing, or moving private keys.
- Rebooting or shutting down the machine.
- Starting persistent services or workers.
- Writing evidence that includes secrets, raw credential output, shell history,
  broad environment dumps, or broad home-directory listings.

## Auth Contract

Bootstrap may install CLIs such as `gh`, `codex`, and `claude`, but it must not
authenticate them. GitHub repository access auth is user-performed and may be a
manual pre-clone deployment step when the Kendall Vnxt repository is private.
OpenAI/Codex, Anthropic/Claude, Tailscale, and other provider login remain
user-performed post-deployment steps only when a workflow actually needs that
service.

Scripts may report whether an auth check is valid, pending, or not configured,
but missing auth must not start auth flows. Evidence must not print raw auth
output, token scopes, auth URLs, device codes, credential helper output, or
token values.

## Evidence Contract

Evidence must follow [evidence/schema.md](evidence/schema.md). File evidence
requires an explicit or generated path under repo-approved evidence storage and
must stay inside `docs/linux-install/evidence/`.

Once the repo is validated and the approved evidence directory is known, setup
or validation failures must write schema-compliant failure evidence before the
bootstrap exits. Failures that happen before the repo evidence directory exists
may stop without file evidence, but repo-access blocked stops must emit
schema-compliant stdout evidence and must still print a clear recovery message.
Bootstrap progress logs must go to stderr so stdout evidence can be captured
and validated.

## Completion Criteria

A Kendall Vnxt Ubuntu deployment is considered proven only when:

- The install was run locally inside Ubuntu as the intended non-root sudo user.
- Ubuntu release is 26.04 or later.
- The single local bootstrap script completed successfully.
- Node satisfies the repo engine range, pnpm matches the repo-pinned version,
  and required tools such as uv, gh, git, Codex CLI, Claude Code, and BMAD
  Method pass version checks.
- Global npm-installed tools match
  [global-tool-manifest.json](global-tool-manifest.json). Floating global npm
  installs are not allowed for pnpm, Codex CLI, Claude Code, or BMAD Method.
  Verify-only must fail on version drift. Install mode may remediate drift only
  through `scripts/bootstrap-linux.sh --install-kendall-vnxt`; post-install
  mismatch must fail.
- The Kendall Vnxt repo checkout is present at `$HOME/Kendall_Nxt` unless an
  approved local repo path override was used.
- The checkout `origin` remote matches the expected Kendall Vnxt repository URL
  before setup or final validation is treated as successful.
- `pnpm run setup` completed.
- `scripts/validate-linux-install.sh --verify-only` passes.
- Bootstrap evidence is redacted and validates.
- Any provider or repository-service auth is either absent or user-configured
  outside the bootstrap; auth absence does not fail the base bootstrap unless
  repo clone itself requires it.
- No stop line was crossed without matching local user authority.

## Documentation Feedback Loop

When a command, assumption, or user step fails during the install, update the
playbook or [lessons-learned.md](lessons-learned.md) in the same work pass. The
install path is not considered repeatable if known mistakes remain only in chat
history.
