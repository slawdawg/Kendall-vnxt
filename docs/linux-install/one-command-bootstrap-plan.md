# Kendall Vnxt Local Ubuntu Bootstrap Plan

Status: local implementation draft
Date: 2026-06-17

## Goal

Make a fresh Ubuntu 26.04-or-later machine reach a known Kendall Vnxt-ready
state through one primary command run locally inside that Ubuntu install by a
non-root user with sudo permissions.

The bootstrap must have explicit safety gates, no bundled third-party
authentication, idempotent reruns, and evidence that proves what changed, what
passed, what was skipped, and what remains manual.

The supported operator model is intentionally simple: the user logs in to
Ubuntu, opens a terminal, and begins the install from that Linux session.

## Feature-Complete Definition

This feature is complete when a user who is not Bob can take any fresh Ubuntu
26.04-or-later machine, log in as a non-root user with sudo permissions, run
the documented Kendall Vnxt bootstrap command locally from a terminal, and
receive one of three evidence-backed outcomes:

- `pass`: Kendall Vnxt base development dependencies, repo setup, and project
  verification are ready.
- `blocked`: the command refused to continue before unsafe or unauthorized
  mutation and reported the exact manual recovery step.
- `fail`: an approved operation failed after a gate passed and the evidence
  reports the failed command summary, recovery guidance, and rerun behavior.

Feature-complete also means the base bootstrap does not perform post-deployment
authentication. Tailscale enrollment, Codex login, Claude login, browser-based
auth, provider tokens, and other user-specific credentials remain explicit
manual follow-up tasks after deployment.

## Primary Scope

This feature slice supports only one install method: the user logs in to Ubuntu
as the non-root sudo-capable Linux user and runs one local bootstrap command or
script that clones Kendall Vnxt if needed and installs it.

Do not document or support SSH, remote execution, staged scripts, manual
fallback sequences, or Windows-to-Linux orchestration as install methods.

Supported command forms:

```bash
tmp=/tmp/kendall-vnxt-bootstrap.sh; url=https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh; if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$url"; else sudo apt-get update && sudo apt-get install -y curl ca-certificates && curl -fsSL "$url" -o "$tmp"; fi && bash "$tmp" --install-kendall-vnxt
```

Publication gate: the GitHub `main` command is the supported user-facing
command only after these installer changes are merged to `main`. Before merge,
real-host validation must run the same script content from the current
workspace or a dedicated test branch and must record which source was used.
The raw bootstrap URL must also be reachable by the intended installer audience
without starting a provider login flow. If the repository remains private, the
project needs a public bootstrap-script release asset or an explicitly
documented pre-authenticated GitHub download path before the GitHub README
command can be called feature-complete.

The repo-owned controller may still expose local planning and verification
commands for development evidence:

```bash
pnpm run linux:bootstrap -- --plan
pnpm run linux:bootstrap -- --verify-only
```

Those controller commands must preserve the same local-only install contract.

Rules:

- No implicit apply. If no mode is supplied, fail with usage.
- `--plan` performs no mutation.
- `--verify-only` checks local readiness without mutation.
- The shell bootstrap script is the only mutating install command.
- Root users are refused before any mutation.
- No other install method is supported for this feature.
- Passwordless sudo is not required. The command may prompt through normal
  interactive sudo in the user's Linux terminal.

## Preconditions

Ubuntu machine:

- Ubuntu 26.04 or later.
- Existing non-root Linux user with sudo permissions.
- The user can open an interactive terminal in the Ubuntu session.
- The local shell can download the bootstrap script with `curl`, `wget`, or
  sudo-approved `apt-get install -y curl ca-certificates`.
- Node, pnpm, and the Kendall Vnxt repo checkout are not preconditions; the
  single bootstrap script installs or clones them after sudo approval and repo
  access checks.
- Outbound internet is available for approved package and tool installs.
- At least 5 GB is available on the user's home filesystem for toolchain, repo,
  dependencies, and evidence.
- The machine can resolve `github.com` before repo/tool bootstrap begins.
- Private GitHub repo access is already available, or the command stops with
  manual repo-auth recovery instructions.

## Gates

Each gate must emit:

- `id`
- `status`: `pass`, `fail`, `warn`, `skip`, or `blocked`
- `summary`
- `recovery`
- `timestamp`
- evidence-safe command or context summary

### local-preflight

Verify Node, pnpm, bash, repo checkout, required scripts, platform, and command
arguments before install work begins.

### local-identity

Verify current user, hostname, OS/version, architecture, home directory, sudo
capability, free disk space, outbound DNS readiness, and non-root user. Refuse
root, unsupported OS, missing sudo, insufficient disk, or missing GitHub DNS
resolution before install steps.

### evidence-path

Validate the evidence destination before verification or apply work begins.
Evidence must stay under `docs/linux-install/evidence/`, must not overwrite an
existing packet, and is not written in `--plan` mode.

### base-tools

Detect existing tools and install only approved base tools during the single
local bootstrap script. Evidence must distinguish pre-existing tools from
installed or changed tools.

### repo-state

Detect, clone, or validate the Kendall Vnxt repo.

If private repo access is missing, stop with a manual GitHub-auth-required
result and recovery instructions. Do not initiate broad authentication flows.

### install-script

Perform bounded mutation only through
`scripts/bootstrap-linux.sh --install-kendall-vnxt`. Approved mutation is
limited to package/tool install, repo clone/update according to policy, project
setup, and evidence writes under approved paths.

### full-verify

Run local verification and record tool versions, repo path, branch, preflight
result, skipped/manual tasks, and validation status.

### evidence-write

Write schema-compliant success or failure evidence under
`docs/linux-install/evidence/` after the evidence destination is known.

### manual-auth-summary

List post-install user tasks only:

- Tailscale login or tailnet enrollment.
- Codex login.
- Claude login.
- Provider authentication.

The bootstrap command must not execute those auth tasks.

## Authority And Auth Boundaries

Bootstrap may:

- Install approved OS packages and tools after explicit local apply authority.
- Install or verify Node, pnpm, uv, git, GitHub CLI, Codex CLI, Claude CLI, and
  BMAD Method CLI.
- Clone or validate the Kendall Vnxt repo when repo access is already
  available.
- Run project setup and verification commands.
- Write schema-compliant evidence under approved paths.

Bootstrap must not:

- Run `tailscale login`.
- Run Codex login or provider auth flows.
- Run Claude auth flows.
- Read, write, print, or request provider tokens.
- Launch browser/session auth flows.
- Start persistent workers or services unless separately approved.
- Use private keys, tokens, or credential helper output in evidence.
- Accept SSH host keys or manage remote SSH trust as part of the installer.

Evidence should include an `auth_boundary` section proving those actions were
not performed.

## Evidence Requirements

Evidence must follow `docs/linux-install/evidence/schema.md` and include:

- command mode
- command invoked, redacted as needed
- local host identity summary
- current user and hostname
- OS/version and architecture
- repo path and repo state
- gate outcomes
- tool versions
- pre-existing versus installed or changed tools
- skipped and blocked actions with reasons
- manual auth tasks
- auth-boundary proof
- result
- rerun guidance
- recovery instruction for failed or blocked gates

Successful and failed runs both produce evidence after the evidence destination
is known. Evidence must never overwrite an existing packet. `--plan` prints a
plan summary without writing evidence.

## Idempotency Requirements

The command must be safe to rerun in these states:

- clean host with no required tools
- tools installed, repo missing
- repo cloned, dependencies missing
- interrupted after package install
- interrupted after repo clone
- full success, rerun
- unsupported OS, no mutation
- root user, no mutation
- missing sudo, no mutation
- local user missing sudo group or sudo command, no mutation

Reruns after success should exit cleanly without destructive changes. Reruns
after partial failure should resume safely or report the exact failed gate and
next recovery command.

## Acceptance Criteria

- Local in-distro execution is declared the only supported install path for
  this feature slice.
- Preconditions are documented and validated for the Ubuntu machine where the
  command runs.
- `--plan` emits planned gates without mutation.
- `--verify-only` checks local Ubuntu readiness without mutation.
- `scripts/bootstrap-linux.sh --install-kendall-vnxt` is the only mutating
  install command.
- The Node verifier rejects `--apply`, `--target`, and `--user`.
- SSH host-key management is not part of the supported install path.
- Root users are refused before any bootstrap mutation.
- Unsupported OS exits before install steps.
- Missing sudo exits before install steps with recovery instructions.
- Bootstrap never invokes Tailscale login, Codex login, Claude auth, provider
  auth, browser login flows, or token writes.
- Successful and failed runs both write schema-compliant evidence once the
  evidence path is known.
- Evidence includes command mode, local identity, OS/version, architecture,
  repo path, repo state, gate outcomes, tool versions, auth-boundary proof,
  skipped/manual tasks, and rerun guidance.
- Evidence distinguishes pre-existing tools from installed or changed tools.
- Install evidence distinguishes local execution, repo state, auth boundary,
  skipped/manual tasks, result, and rerun guidance.
- Re-running after success exits cleanly without destructive changes.
- Re-running after partial failure resumes safely or reports the exact failed
  gate and recovery command.
- Real Ubuntu 26.04-or-later local-host evidence proves the documented command
  path works.
- Real Ubuntu 26.04-or-later local-host rerun evidence proves idempotency.
- `pnpm.cmd run check:docs` passes from the Windows repo checkout.
- Targeted parser, gate, executor, evidence schema, and auth-denylist tests
  pass.

## Test Plan

Unit tests:

- argument parsing
- missing option values
- conflicting modes
- root local user
- invalid evidence path
- apply authority requirements

Contract tests:

- gate ordering
- no mutation in `--plan`
- no mutation in `--verify-only`
- the shell bootstrap script is the only mutating install path
- evidence shape
- auth denylist

Executor tests:

- local shell command construction
- local path handling
- sudo command behavior
- command summary redaction

Idempotency tests:

- clean host
- existing tools
- existing repo
- partial install state
- successful rerun

Negative tests:

- unsupported OS
- missing sudo
- bad Node or pnpm version where feasible
- unsupported non-Ubuntu platform

Journey proof:

- one real Ubuntu 26.04-or-later local run with captured schema-compliant
  evidence
- one rerun after success proving idempotency

## Current Implementation Evidence

Local implementation progress:

- `scripts/bootstrap-linux.sh --install-kendall-vnxt` exists as the single
  local bootstrap script mode for install.
- The bootstrap script installs approved tools, installs agent CLIs, clones or
  validates the repo, runs `pnpm run setup`, runs final validation, and writes
  timestamped local install evidence.
- Local install evidence now includes manual auth tasks, auth-boundary proof,
  result, and rerun guidance.
- Internal modules exist under `scripts/lib/linux-bootstrap/`.
- The repo-owned controller rejects `--target` and `--user`, derives local
  identity from the current Ubuntu session, and no longer has an SSH executor
  helper.
- The Node verifier rejects `--apply`, `--target`, and `--user`.
- Local identity checks cover root refusal, Ubuntu 26.04+, sudo availability,
  free home-filesystem space, and `github.com` DNS resolution.
- `pnpm run check:linux-bootstrap` runs the local feature gate: entrypoint
  syntax, controller syntax, evidence-schema syntax, helper-checker syntax,
  delegated shell syntax, the single-method install contract check, and the
  Linux bootstrap test suite.
- The Linux bootstrap test suite includes non-mutating shell-script contract
  tests for `--install-kendall-vnxt` help text, missing option values, and
  unsupported remote-target arguments.
- The documented one-line GitHub command can seed `curl` and
  `ca-certificates` with sudo when neither `curl` nor `wget` is present.
- The bootstrap script derives the `gh repo clone` slug from `--repo-url`
  instead of hardcoding a separate clone target, so private-repo fallback and
  repo URL overrides stay aligned.
- Existing repo reuse validates the `origin` remote against `--repo-url` before
  running setup, so `$HOME/Kendall_Nxt` cannot silently point at the wrong repo.
- Final validation receives the same `--repo-url` value used by the bootstrap,
  so repo-origin evidence stays correct when a test branch or alternate repo URL
  is used for pre-merge proof.
- Install evidence naming is collision-safe for fast reruns by adding a numeric
  suffix instead of overwriting an existing evidence packet.
- After the repo is validated and the approved evidence directory exists,
  project setup failures write a schema-compliant failure evidence packet
  before the bootstrap exits.
- If repo access is blocked before the repo evidence directory exists, the
  bootstrap emits schema-compliant blocked evidence to stdout instead of writing
  an arbitrary file outside the repo. The packet records completed mutation
  families but does not include an `evidence-file` mutation.
- Bootstrap progress logs go to stderr so stdout remains parseable when it is
  used for pre-repo blocked evidence.
- Agent CLI install is idempotent at the command-presence level: reruns skip
  `npm install -g` for Codex CLI, Claude Code, and BMAD Method when their
  commands already exist.
- pnpm install is idempotent for the pinned version: reruns skip
  `npm install -g pnpm@11.5.2` when that exact version is already installed.
- uv install is idempotent when both `uv` and `uvx` are already available;
  reruns skip the uv installer while still allowing symlink repair when needed.
- `scripts/check-linux-bootstrap-evidence.mjs` validates captured bootstrap
  and install evidence packets before they are promoted from disposable proof
  to durable evidence.
- `pnpm run linux:plan` has passed locally and emits a non-mutating plan that
  points mutation recovery to `scripts/bootstrap-linux.sh --install-kendall-vnxt`
  rather than a Node controller apply path.
- The single-method install contract check enforces the GitHub `main`
  publication gate so local pre-merge proof is not confused with published
  README-command proof.
- The URL checker has a non-network-dependent failure test proving unreachable
  bootstrap sources fail closed.
- Current Ubuntu 26.04 package indexes show the default `nodejs` package is in
  the required Node 22 range; the real-host apt result remains the final
  authority during install evidence capture.
- If real-host apt provides an unsupported Node version, the single bootstrap
  script must be updated to install an approved Node channel and then rerun;
  feature-complete proof must not use an undocumented manual Node workaround.
- `pnpm run check:linux-bootstrap-url` currently fails with HTTP 404 for the
  raw GitHub `main` bootstrap URL, so the published README command is not yet
  proven reachable.
- [fresh-host-proof-procedure.md](fresh-host-proof-procedure.md) defines the
  required first-install and idempotency evidence capture steps and forbids
  switching to a manual multi-step install workaround.
- [troubleshooting.md](troubleshooting.md) has been rewritten around the
  single local bootstrap command and is included in the single-method contract
  scan.
- [index.md](index.md) now separates the generic install path from historical
  and instance-specific notes, and the contract checker enforces that the
  historical section cannot override the single-method v1 boundary.

Remaining before feature-complete:

- Publish the installer changes to the source used by the documented GitHub
  `main` command, or record pre-merge evidence as branch/workspace evidence
  only.
- Prove the documented bootstrap script URL is reachable by the intended
  installer audience, or publish an equivalent public bootstrap source.
- Run the
  [fresh host proof procedure](fresh-host-proof-procedure.md) against a fresh
  or reset Ubuntu 26.04-or-later host.
- Capture and validate first-install evidence.
- Rerun after success and capture validated idempotency evidence.
- Refresh `docs/linux-install.zip` when the implementation and evidence are
  ready for a real PR.
- Perform a code review before PR.

## Next Execution Plan

1. Run local bootstrap checks:

   ```powershell
   pnpm.cmd run check:linux-bootstrap
   pnpm.cmd run check:docs
   ```

2. Run a real non-mutating verify-only smoke inside the current Linux host and
   validate the disposable evidence packet.
3. Delete disposable smoke evidence.
4. Wait for explicit approval before any real single-script install run because
   it mutates the Ubuntu host.
5. After approval, run the single local bootstrap script inside a fresh or
   reset Ubuntu 26.04-or-later host and capture durable evidence.
6. Rerun locally on the same host to capture idempotency evidence.
7. Update lessons learned, troubleshooting, validation matrix, and evidence
   schema with anything learned from real-host execution.
8. Run code review and fix findings.
9. Refresh the downloadable docs package only when the feature slice is ready
    for a real PR.

## Implementation Shape

Public entry point:

```text
scripts/linux-bootstrap.mjs
```

Internal modules:

```text
scripts/lib/linux-bootstrap/args.mjs
scripts/lib/linux-bootstrap/gates.mjs
scripts/lib/linux-bootstrap/executor.mjs
scripts/lib/linux-bootstrap/evidence.mjs
```

Tests:

```text
tests/linux-bootstrap/*.test.mjs
```

Documentation updates:

```text
docs/linux-install/install-playbook.md
docs/linux-install/install-contract.md
docs/linux-install/validation-matrix.md
docs/linux-install/evidence/schema.md
docs/linux-install/troubleshooting.md
docs/linux-install/lessons-learned.md
```

Packaging:

- Refresh `docs/linux-install.zip` only when the feature slice is ready for a
  real PR.

## Out Of Scope For This Slice

- SSH-driven orchestration.
- Windows-to-Linux remote execution.
- Staged remote scripts.
- Multi-step manual install sequences presented as an alternate method.
- Tailscale enrollment.
- Codex login.
- Claude login.
- Provider authentication.
- Persistent service or worker launch.
- Automatic GitHub authentication flows.
- Destructive cleanup or rollback beyond reporting recovery steps.
