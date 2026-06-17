# Kendall Vnxt Ubuntu Deployment Validation Matrix

Status: draft v1

## Validation Stages

| Stage | Command family | Target | Pass criteria | Mutation |
| --- | --- | --- | --- | --- |
| Host preparation | Local checklist | Ubuntu host | Ubuntu 26.04+ host exists with an intended non-root sudo user and local terminal access | User-created host |
| Single install command | `bash /tmp/kendall-vnxt-bootstrap.sh --install-kendall-vnxt` | Ubuntu host | Approved tools install, repo is cloned or validated, setup runs, validation passes, and local install evidence is written | Mutating, local sudo approval plus evidence file |
| Local script syntax | `node --check`, `bash -n` | Repo checkout | Bootstrap scripts parse | None |
| Local plan | `pnpm run linux:bootstrap -- --plan` | Ubuntu host/repo checkout | Prints local gate plan, auth boundary, and manual next steps | None |
| Local verify-only | `pnpm run linux:bootstrap -- --verify-only` | Ubuntu host/repo checkout | Local identity, OS, sudo availability, disk, DNS, repo, tool versions, and validation pass or fail closed | Evidence file only |
| Evidence path | `pnpm run linux:bootstrap -- --verify-only --evidence <path>` | Ubuntu host/repo checkout | Evidence path is under `docs/linux-install/evidence/` and does not overwrite an existing packet before verification work continues | None until evidence-write |
| Bootstrap tests | `pnpm run test:linux-bootstrap` | Repo checkout | Parser, gate, evidence, executor, and auth-boundary tests pass | Temporary test evidence only |
| Bootstrap quality gate | `pnpm run check:linux-bootstrap` | Repo checkout | Entrypoint syntax, controller syntax, evidence-schema syntax, shell syntax, and Linux bootstrap tests pass | Temporary test evidence only |
| Bootstrap evidence schema | `pnpm run check:linux-bootstrap-evidence -- <evidence.json>` | Repo checkout | Captured bootstrap evidence satisfies the local evidence contract | None |
| Toolchain | `scripts/validate-linux-install.sh --verify-only` | Ubuntu host/repo checkout | node satisfies `>=22 <25`, pnpm is `11.5.2`, and uv, gh, git are available | None |
| Agent CLIs | `scripts/validate-linux-install.sh --verify-only` | Ubuntu host/repo checkout | `codex`, `claude`, and `bmad-method` are available | None |
| Repo readiness | `scripts/validate-linux-install.sh --verify-only` | Ubuntu host/repo checkout | repo exists, `origin` matches the expected Kendall Vnxt repo URL, and requested read-only checks pass | None |
| Post-deployment GitHub readiness | `gh auth status`, only after the user logs in | Ubuntu host | Auth succeeds when a selected workflow needs private GitHub access | User auth state |
| Private repo probe | `git ls-remote ... HEAD`, only after the user logs in | Ubuntu host | Private repo HEAD resolves without prompting | None |
| Install evidence | `bash /tmp/kendall-vnxt-bootstrap.sh --install-kendall-vnxt` | Ubuntu host | Only approved packages/tools, repo clone/validate, setup, verification, and evidence actions run; local-session evidence is written | Mutating, local sudo approval plus evidence file |
| Post-apply verify | `pnpm run linux:bootstrap -- --verify-only` | Ubuntu host/repo checkout | Same baseline and repo checks pass after apply | Evidence file only |
| Full check | `pnpm run check` | Ubuntu host/repo checkout | Docs checks, dashboard build, and supervisor tests pass | Repo build/test artifacts only |
| Playwright e2e | `pnpm run test:e2e:dashboard` | Ubuntu host/repo checkout | Chromium launches and dashboard e2e tests pass | Browser cache/test artifacts; dependency install is mutating |
| Reboot proof | `sudo reboot`, then verify | Ubuntu host | Local verify-only, preflight, and tool probes pass after reboot | Reboot, approval required |
| Real work cycle | Codex workspace experiment | Ubuntu host/repo checkout | create, verify, and cleanup a real repo work item | Isolated worktree mutation |
| Snapshot/backup | Host backup or VM snapshot | Ubuntu host | Recovery point exists after all proofs pass | Recovery point |

## Negative Checks

The flow must fail closed when:

- The command is not running as the local Ubuntu user.
- The local user is `root`.
- `/etc/os-release` is not Ubuntu 26.04 or later.
- `sudo` is missing.
- The home filesystem has less than 5 GB available.
- `github.com` cannot be resolved.
- Repo access is unavailable and would require an interactive GitHub auth flow.
- The repo target path exists but is not a Git checkout.
- The repo target path is a Git checkout without an `origin` remote or with an
  `origin` remote that does not match the expected Kendall Vnxt repo URL.
- Evidence path is outside `docs/linux-install/evidence/`.
- Evidence would overwrite an existing packet.
- A script attempts automated GitHub, provider, Tailscale, Codex, Claude,
  browser, or credential helper login/mutation during base bootstrap.
- Evidence would include token scopes, auth URLs, credential helper output,
  shell history, broad environment dumps, private keys, or broad home listings.

## Container Boundary

Container validation is useful for script syntax, idempotence, and package
resolution logic. It is not host certification. The install is not proven until
the actual Ubuntu host passes the single local bootstrap command, local
verify-only checks, and evidence validation under the same local user identity.
