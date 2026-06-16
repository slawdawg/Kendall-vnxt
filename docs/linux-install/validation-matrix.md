# Kendall Vnxt Ubuntu Deployment Validation Matrix

Status: draft v1

## Validation Stages

| Stage | Command family | Target | Pass criteria | Mutation |
| --- | --- | --- | --- | --- |
| Host preparation | Operator checklist | Machine/VM/cloud | Ubuntu 26.04+ host exists with an intended non-root user and console access or SSH reachability | Operator-created target |
| Plan | `pnpm run linux:plan` | Host | Prints target, stages, stop lines, and next commands | None |
| Local script syntax | `node --check`, `bash -n` | Host | Scripts parse | None |
| First SSH trust | `ssh -o StrictHostKeyChecking=accept-new ... <ssh-alias>` | Host/VM | New host key is recorded only after target ownership is confirmed | `known_hosts` add only |
| SSH identity | Future verify mode | SSH target | Host key known, target resolves, optional expected user matches | None |
| Fresh host baseline | `validate-linux-install.sh --verify-only --skip-repo` | Ubuntu host | Ubuntu 26.04+, current or expected user, and target identity detected; missing tools are reported | None |
| OS baseline | `validate-linux-install.sh --verify-only` | Ubuntu host | Ubuntu 26.04+ detected after setup | None |
| Toolchain | `validate-linux-install.sh --verify-only --skip-repo` | Ubuntu host | node satisfies `>=22 <25`, pnpm is `11.5.2`, and uv, gh, git are available | None |
| Agent CLIs | `validate-linux-install.sh --verify-only` | Ubuntu host | `codex`, `claude`, and `bmad-method` available | None |
| Repo readiness | `validate-linux-install.sh --verify-only` | Ubuntu host | repo exists and requested read-only checks pass | None |
| Post-deployment GitHub readiness | `gh auth status`, only after the user logs in | Ubuntu host | Auth succeeds when a selected workflow needs private GitHub access | User auth state |
| Private repo probe | `git ls-remote ... HEAD`, only after the user logs in | Ubuntu host | Private repo HEAD resolves without prompting | None |
| Repo setup | `git clone`, `pnpm run setup` | Ubuntu host | Repo clone exists, dependencies install, preflight passes when repo work is requested | Mutating, approval required |
| Apply dry run | Future apply mode | Ubuntu host | Reports exact intended mutations and rollback limits | None |
| Apply | Future apply mode | Ubuntu host | Only approved packages/files/services changed | Mutating, approval required |
| Post-apply verify | Future verify mode | Ubuntu host | Same baseline and repo checks pass after apply | None |
| Full check | `pnpm run check` | Ubuntu host | Docs checks, dashboard build, and supervisor tests pass | Repo build/test artifacts only |
| Playwright e2e | `pnpm run test:e2e:dashboard` | Ubuntu host | Chromium launches and dashboard e2e tests pass | Browser cache/test artifacts; dependency install is mutating |
| Reboot proof | `sudo reboot`, then verify | Ubuntu host | SSH returns and toolchain/repo checks still pass | Reboot, approval required |
| Real work cycle | Codex workspace experiment | Ubuntu host | create, verify, and cleanup a real repo work item | Isolated worktree mutation |
| Snapshot/backup | Host backup or VM snapshot | Ubuntu host | Recovery point exists after all proofs pass | Recovery point |

## Negative Checks

The flow must fail closed when:

- The configured SSH alias or host name does not resolve or resolves to an
  unexpected host key.
- First SSH trust would replace an existing host key instead of adding a new
  one.
- A stale raw IP address is used as the durable target.
- `whoami` does not match `--user` when `--user` is provided.
- `/etc/os-release` is not Ubuntu 26.04 or later.
- A private key path or private-key-looking content is provided.
- An `authorized_keys` change would overwrite instead of append.
- Remote apply is requested before verify-only preconditions pass.
- The approval packet omits rollback, reboot, evidence, or expected mutation
  details.
- A script attempts automated GitHub, provider, Tailscale, or credential helper
  login/mutation during base bootstrap.
- SSH target begins with `-` or contains unsupported shell-command characters.
- Evidence path is outside `docs/linux-install/evidence/`.
- Evidence would include token scopes, auth URLs, credential helper output,
  shell history, broad environment dumps, or broad home listings.

## Container Boundary

Container validation is useful for script syntax, idempotence, and package
resolution logic. It is not host certification. The install is not proven until
the actual Ubuntu target passes local verify-only checks, and remote verify-only
checks too when the SSH operator path is used, under the same user and host
identity.
