# Linux Install Validation Matrix

Status: draft v1

## Validation Stages

| Stage | Command family | Target | Pass criteria | Mutation |
| --- | --- | --- | --- | --- |
| VM creation | Operator checklist | Hypervisor | Ubuntu VM exists with `Kendall_vNxt`, `slaw_dawg`, SSH reachability | Operator-created target |
| Plan | `pnpm run linux:plan` | Host | Prints target, stages, stop lines, and next commands | None |
| Local script syntax | `node --check`, `bash -n` | Host | Scripts parse | None |
| First SSH trust | `ssh -o StrictHostKeyChecking=accept-new ... kendall-linux` | Host/VM | New host key is recorded only after target ownership is confirmed | `known_hosts` add only |
| SSH identity | Future verify mode | `kendall-linux` | Host key known, target resolves, user is `slaw_dawg` | None |
| Fresh VM baseline | `validate-linux-install.sh --verify-only --skip-repo` | VM | Ubuntu 26.04, expected user, and target identity detected; missing tools are reported | None |
| OS baseline | `validate-linux-install.sh --verify-only` | VM | Ubuntu 26.04 detected after setup | None |
| Toolchain | `validate-linux-install.sh --verify-only` | VM | node, pnpm, uv, gh, git available | None |
| Agent CLIs | `validate-linux-install.sh --verify-only` | VM | `codex` and `claude` available | None |
| Repo readiness | `validate-linux-install.sh --verify-only` | VM | repo exists and requested read-only checks pass | None |
| GitHub readiness | `validate-linux-install.sh --verify-only` | VM | `gh auth status` succeeds or manual auth is clearly pending | None |
| Private repo probe | `git ls-remote ... HEAD` | VM | Private repo HEAD resolves without prompting | None |
| Repo setup | `git clone`, `pnpm run setup` | VM | Repo clone exists, dependencies install, preflight passes | Mutating, approval required |
| Apply dry run | Future apply mode | VM | Reports exact intended mutations and rollback limits | None |
| Apply | Future apply mode | VM | Only approved packages/files/services changed | Mutating, approval required |
| Post-apply verify | Future verify mode | VM | Same baseline and repo checks pass after apply | None |
| Full check | `pnpm run check` | VM | Docs checks, dashboard build, and supervisor tests pass | Repo build/test artifacts only |
| Reboot proof | `sudo reboot`, then verify | VM | SSH returns and toolchain/repo checks still pass | Reboot, approval required |
| Real work cycle | Codex workspace experiment | VM | create, verify, and cleanup a real repo work item | Isolated worktree mutation |
| Snapshot | VM manager snapshot | VM | Bob confirms snapshot after all proofs pass | VM recovery point |

## Negative Checks

The flow must fail closed when:

- `kendall-linux` does not resolve or resolves to an unexpected host key.
- First SSH trust would replace an existing host key instead of adding a new
  one.
- A stale raw IP address is used as the durable target.
- `whoami` is not `slaw_dawg`.
- `/etc/os-release` is not Ubuntu 26.04.
- A private key path or private-key-looking content is provided.
- An `authorized_keys` change would overwrite instead of append.
- Remote apply is requested before verify-only preconditions pass.
- The approval packet omits rollback, reboot, evidence, or expected mutation
  details.
- A script attempts automated GitHub login or credential helper mutation.
- Evidence would include token scopes, auth URLs, credential helper output,
  shell history, broad environment dumps, or broad home listings.

## Container Boundary

Container validation is useful for script syntax, idempotence, and package
resolution logic. It is not VM certification. The install is not proven until
the actual Ubuntu VM target passes remote verify-only checks and post-apply
checks under the same user and host identity.
