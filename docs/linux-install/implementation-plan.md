# Kendall Vnxt Ubuntu Deployment Implementation Plan

Date: 2026-06-16
Status: historical/superseded

Superseded by:

- [one-command-bootstrap-plan.md](one-command-bootstrap-plan.md)
- [install-playbook.md](install-playbook.md)
- [install-contract.md](install-contract.md)

This document is retained as planning history only. It contains earlier
remote, staged, and multi-mode ideas that are not supported by the current v1
installer. The only supported v1 install method is a local Ubuntu 26.04-or-later
non-root sudo user running the single Kendall Vnxt bootstrap command from that
Ubuntu terminal.

## Goal

Make the Kendall Vnxt deployment path on Ubuntu repeatable, safe, and
testable. The supported target is a fresh Ubuntu 26.04 LTS or later install on a
physical machine, VM, or cloud host with an existing non-root Linux user.

This plan incorporates the round-table review from Winston, Amelia, Murat, and
Paige. The core decision is contract-first and verify-only-first. Remote
mutation is not allowed until the contract, validator, evidence policy, and
approval boundary exist.

## v1 Scope

Supported:

- Ubuntu 26.04 LTS or later.
- Creating or choosing the Ubuntu machine as an operator prerequisite.
- Physical machine, VM, or cloud host.
- Existing non-root Linux user.
- Repo path defaults to `$HOME/Kendall_Nxt` and may be overridden with
  `--repo`.
- Direct local-terminal access for the primary on-host path, or a stable SSH
  target alias or host name for the optional remote operator path. Raw IP
  addresses are current observations only and must not be embedded as durable
  playbook identity.
- Optional expected hostname. If not provided, record the observed hostname
  without failing validation.
- Host private key remains on the operator host.
- Targets receive only the approved public key.
- Provider authentication is excluded from base bootstrap. Private GitHub repo
  access auth is a manual user action before clone when the repo is private.
  OpenAI, Anthropic, Tailscale, and similar provider login remain
  post-deployment only when needed.
- Container validation as script/idempotency evidence.
- Host validation as real platform evidence.

Not supported in v1:

- Automated machine, VM, or cloud provisioning.
- Automated user creation.
- Broad distro support.
- Copying private SSH keys.
- Automating GitHub, OpenAI, Anthropic, Tailscale, or other provider login.
- Starting long-running dev services by default.
- Remote `--apply` without explicit operator approval.

## Authority Model

Every playbook step and script mode must name one authority family.

| Authority | Allowed in v1 | Examples |
| --- | --- | --- |
| `local-read` | Yes | Inspect repo docs/scripts and local command availability. |
| `local-write` | Yes, scoped | Write reviewed docs and non-secret evidence files under approved repo paths. |
| `container-write` | Yes | Mutate disposable test containers. |
| `remote-read` | Yes | SSH read-only checks against an approved target. |
| `remote-write` | Gated | Package install, SSH key install, repo clone, shell/profile changes, service changes. |
| `repo-auth` | Manual only when needed before private repo clone | The user runs `gh auth login` on the Ubuntu host when the Kendall Vnxt repo is private; scripts may run redacted status probes that report valid, pending, or not configured. |
| `post-deploy-auth` | Manual only after deployment | The user runs provider login or Tailscale auth only when a workflow needs it; scripts may run redacted status probes that report valid, pending, or not configured. |
| `reboot` | Gated | Host reboot proof after approved setup. |
| `cleanup` | Gated when destructive | Exact-path cleanup only, with evidence and recovery notes. |

Remote mutation approval must name:

- target host
- target alias or stable name
- target user
- operation family
- exact command or script
- expected files changed
- packages installed or removed
- config files touched
- services enabled, disabled, started, or stopped
- credential or auth state changes; excluded from base bootstrap
- reboot or session requirements
- rollback or recovery path
- rollback limits
- evidence destination

## Required Artifacts

Create:

```text
docs/linux-install/
  index.md
  implementation-plan.md
  install-contract.md
  install-playbook.md
  validation-matrix.md
  ssh-key-policy.md
  troubleshooting.md
  evidence/
    schema.md

scripts/
  linux-bootstrap.mjs
  validate-linux-install.sh
  bootstrap-linux.sh
  test-linux-bootstrap-container.mjs
  check-linux-playbook-drift.mjs
```

## One-Command Target

The desired operator experience is one command, without removing the safety
gates. The command should orchestrate a staged flow:

```text
plan -> verify -> apply -> verify -> evidence
```

Future target command surface:

```powershell
pnpm run linux:plan -- --target <ssh-alias-or-host>
pnpm run linux:verify -- --target <ssh-alias-or-host>       # future, not implemented
pnpm run linux:bootstrap -- --target <ssh-alias-or-host> --apply       # future, not implemented
pnpm run linux:bootstrap -- --target <ssh-alias-or-host> --apply --run-check       # future, not implemented
```

The one-command path must still fail closed on stop lines. It must not mean
blind remote automation.

Required one-command behavior:

- Resolve the stable SSH target alias.
- Verify target identity before mutation.
- Copy or stream only approved bootstrap/validator scripts to the target.
- Pass only public key content when SSH key installation is requested.
- Keep the operator's private key on the host.
- Stop on unsupported OS.
- Stop when `--user` is provided and the remote user does not match.
- Stop on dirty existing repo unless explicitly allowed by a later contract.
- Do not fail base bootstrap when provider auth is missing. Report it as a
  post-deployment user step only when a selected workflow needs it. Private
  repo auth is manual before clone when the repo is private.
- Never consume GitHub tokens or private keys.
- Write redacted evidence.

Implementation shape:

```text
scripts/linux-bootstrap.mjs          # host-side orchestrator
scripts/bootstrap-linux.sh           # target-side installer
scripts/validate-linux-install.sh    # target-side verifier
docs/linux-install/*.md              # contract and operator docs
```

The Node orchestrator exists to avoid host-shell-to-SSH quoting traps and to
centralize target selection, script transfer, exit-code handling, and evidence
collection.

## Missing Pieces To Close Before Bootstrap Apply

These are not optional. They must exist before any install/apply automation is
treated as ready:

| Missing piece | Why it matters | Required before |
| --- | --- | --- |
| `install-contract.md` | Binding source for scope, authority, stop lines, and non-goals. | Any bootstrap apply mode |
| `evidence/schema.md` | Fixed redacted evidence shape for validators and review. | Any evidence packet generation |
| `ssh-key-policy.md` | Public-key-only handling and private-key rejection rules. | Any SSH key install logic |
| `validation-matrix.md` | Separates container evidence from VM evidence and real work-cycle proof. | Container harness |
| `troubleshooting.md` | Symptom-first recovery without broad secret-leaking diagnostics. | Operator handoff |
| `remote-approval-template.md` | Standard approval packet for any remote mutation, reboot, or destructive cleanup. | Remote apply, reboot, cleanup |
| Machine creation checklist | Prevents the playbook from assuming an already-created evaluation VM or host. | Remote verify/apply |
| `scripts/linux-bootstrap.mjs` plan | Defines the host-side one-command orchestration boundary. | One-command remote bootstrap |
| `scripts/validate-linux-install.sh` | First executable verify-only contract. | Bootstrap apply |
| Container engine decision | Avoids accidental Docker/Podman coupling. | Container harness |
| Stable target naming | Avoids binding docs/scripts to a DHCP-assigned IP. | Remote verify/apply |
| Hostname/target evidence | Avoids confusing display identity, OS hostname, SSH alias, and DNS name. | Remote verify/apply |
| Reboot proof evidence | Confirms setup survives restart after final PATH/uv fix. | Primary-platform cutover |
| First real work-cycle evidence | Proves daily development, not just synthetic checks. | Declaring Linux the active development baseline |

## Implementation Order

1. Create `install-contract.md` with authority model, scope, stop lines, and
   non-goals.
2. Create the documentation skeleton: host preparation playbook, validation matrix, SSH key
   policy, troubleshooting, and evidence schema.
3. Implement `scripts/validate-linux-install.sh` in verify-only mode.
4. Implement `scripts/bootstrap-linux.sh --dry-run` and `--verify-only`.
5. Design `scripts/linux-bootstrap.mjs --plan` and `--verify-only` as the
   host-side one-command wrapper without remote apply.
6. Add container/local `bootstrap-linux.sh --apply` after verify-only is stable.
7. Add `scripts/test-linux-bootstrap-container.mjs` for Ubuntu 26.04 clean
   install and second-run idempotency.
8. Add `scripts/check-linux-playbook-drift.mjs` with simple filename, mode, and
   version checks.
9. Run remote host verify-only through `linux-bootstrap.mjs`.
10. Request operator approval for any remote host apply.
11. Enable `linux-bootstrap.mjs --apply` only after approval.
12. Run Playwright browser dependency and dashboard e2e proof.
13. Run reboot proof.
14. Complete one normal development work cycle from Linux.

## Verify-Only Contract

The first executable script must be `validate-linux-install.sh`. It must not
mutate the target except when `--evidence` is explicitly used to write one
redacted evidence file under `docs/linux-install/evidence/`.

Required checks:

- Ubuntu version is `26.04` or later.
- Current user is accepted by default; optional `--user` enforces a specific
  remote user.
- `$HOME/Kendall_Nxt` exists when repo validation is requested, unless `--repo`
  overrides the path.
- Node resolves and is compatible with repo requirements.
- pnpm resolves to the repo-pinned version inside the repo.
- uv resolves non-interactively.
- gh is installed.
- Codex CLI is installed.
- Claude Code is installed.
- BMAD Method CLI is installed.
- Provider and repository-service auth is not required for base bootstrap.
- private repo access is checked only when the user has already configured GitHub
  auth and requested a workflow that needs the private repo.
- `pnpm run preflight` passes when repo validation is requested.
- optional full check, dashboard e2e, and workspace smoke are explicit flags.
- no stale exact `node`, `pnpm`, or `python` processes remain after smoke tests.

The validator must exit non-zero on failed required checks and write only
redacted evidence to approved evidence paths.

## Bootstrap Contract

`bootstrap-linux.sh` must support:

```bash
scripts/bootstrap-linux.sh --dry-run
scripts/bootstrap-linux.sh --verify-only
scripts/bootstrap-linux.sh --install-toolchain
```

Rules:

- `--dry-run` prints planned actions and writes nothing.
- `--verify-only` writes nothing and delegates readiness checks to the
  validator where possible.
- `--install-toolchain` is idempotent for the approved host toolchain scope and
  may prompt interactively for sudo.
- Unsupported OS exits non-zero before package mutation.
- User mismatch exits non-zero only when `--user` is provided.
- Public SSH key install requires explicit public key content or path.
- Private key input is rejected.
- GitHub, OpenAI/Codex, Anthropic/Claude, Tailscale, and other provider auth
  are never part of base bootstrap automation.
- Bootstrap may detect auth state, but must not run `gh auth login`, provider
  login commands, Tailscale auth, browser/device-code flows, consume tokens,
  read token files, copy credential state, or write credential helper
  configuration.
- Long-running services are not started by default.
- Agent CLI install may install `@openai/codex`,
  `@anthropic-ai/claude-code`, and `bmad-method`, but provider login and BMAD
  project install/upgrade remain manual.

## Evidence Policy

Evidence may include:

- timestamp
- target alias
- current observed address, if useful
- OS release
- kernel version
- VM/display identity
- OS hostname
- image or install profile label, if one exists
- user
- repo path and commit
- command names
- tool versions
- pass/fail status
- sanitized stderr summaries
- artifact paths

Evidence must not include:

- private keys
- tokens
- full environment dumps
- shell history
- raw auth payloads
- credential helper contents
- GitHub token values or raw auth payloads; future install evidence should
  prefer `auth valid` plus private repo probe result over listing token scopes
- broad home-directory listings
- provider payloads or secrets

## Validation Ladder

| Stage | Purpose | Required before support claim |
| --- | --- | --- |
| Container clean install | Prove install mechanics on Ubuntu 26.04 | Yes |
| Container second run | Prove idempotency | Yes |
| Host preparation checklist | Prove the target exists and has the expected user/network/console-or-SSH shape | Yes |
| Local host verify-only | Prove real target current state from the Ubuntu host terminal | Yes |
| Remote host verify-only | Prove real target current state through an approved SSH alias or stable name when using the remote path | Only for remote path |
| Remote host apply | Prove setup on a real host | Gated by operator approval |
| Reboot proof | Prove persistence | Yes before cutover |
| First real work cycle | Prove daily usability | Yes before declaring Linux the active development baseline |

Container evidence is never labeled as VM-certified evidence.

## Negative Checks

The validator, bootstrap harness, or documented manual checks must explicitly
cover these stop-line cases before the install path is considered repeatable:

- SSH alias resolves to the wrong host or an unexpected SSH host key.
- Target resolves to a stale observed IP and cannot be tied back to the
  intended Ubuntu host.
- `--user` is provided and `whoami` does not match the expected user.
- Ubuntu version is older than `26.04`.
- `authorized_keys` update would overwrite existing entries instead of
  appending only when absent.
- A private key path or private key material is provided as input.
- Remote bootstrap is attempted before verify-only preconditions pass.
- Approval packet is missing rollback limits, reboot/session requirements, or
  evidence destination.
- Missing GitHub/provider auth triggers an automated token read, login command,
  browser/device-code flow, or credential helper mutation.
- Evidence would include token scopes, auth URLs, credential helper output,
  shell history, broad home listings, or full environment dumps.

## First Milestone

Deliver these first:

```text
docs/linux-install/install-contract.md
docs/linux-install/validation-matrix.md
docs/linux-install/ssh-key-policy.md
docs/linux-install/evidence/schema.md
docs/linux-install/remote-approval-template.md
scripts/validate-linux-install.sh
scripts/linux-bootstrap.mjs
```

No remote mutation belongs in the first milestone.

The first milestone is complete only when:

- `install-contract.md` defines all authority families.
- `ssh-key-policy.md` states that targets receive only the public key.
- `evidence/schema.md` lists allowed and forbidden evidence fields.
- `validation-matrix.md` labels container results as non-VM-certified.
- `remote-approval-template.md` can be used without rewriting it in chat.
- `install-playbook.md` starts with host preparation and does not assume an existing VM.
- `troubleshooting.md` gives symptom-first recovery without broad secret-leaking diagnostics.
- `validate-linux-install.sh --verify-only` exists and performs no mutation.
- `linux-bootstrap.mjs` has a documented no-mutation `--plan` path or stub.
- The planned command is executable as `node ./scripts/linux-bootstrap.mjs --plan`.

## Open Decisions

| Decision | Current default | When to decide |
| --- | --- | --- |
| Container engine | Undecided; prefer one engine for v1 | Before `test-linux-bootstrap-container.mjs` |
| Stable target name | Operator-chosen SSH alias or host name; IP is not durable | Before remote verify/apply |
| Reboot proof timing | Pending | Before primary-platform cutover |
| First real work cycle | Pending | Before declaring Linux the active development baseline |
