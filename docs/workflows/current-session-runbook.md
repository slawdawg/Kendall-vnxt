# Current Session Runbook

This is the stable first-read pointer for any Codex session starting in this
repo.

Read these first:

```text
AGENTS.md
docs/ai-context/index.md
docs/workflows/linux-primary-development-runbook.md
docs/workflows/planning-doc-clean-install-boundary.md
docs/workflows/alpha-daily-use-runbook.md
docs/workflows/cockpit-autostart-runbook.md
docs/workflows/branch-foundation-setup.md
```

Then use these navigation indexes before starting architecture, PRD, story, or
execution-authority work:

```text
docs/architecture/index.md
docs/workflows/product-requirements-boundary.md
docs/workflows/implementation-evidence-boundary.md
```

Recommended prompt:

```text
Read AGENTS.md and docs/workflows/current-session-runbook.md, then continue from the repo state as source of truth.
```

## Reboot and resume handoff

After a host reboot or a new Codex session, use this exact request:

```text
Use the Reboot & resume handoff in docs/workflows/current-session-runbook.md and continue the active Kendall_Nxt goal from current repository, manager, and authenticated Tailnet runtime evidence.
```

Treat the command output below as the handoff. It deliberately derives the
current revision and MagicDNS name at resume time; it is not a dated snapshot.
Run it from the canonical checkout on the Ubuntu host:

```bash
cd "$HOME/Kendall_Nxt"
git status --short --branch
git rev-parse HEAD
pnpm run preflight
pnpm run lan-cockpit:status
export AUTH_DIR="$HOME/kendall-lan-auth"
export TAILNET_HOST="$(tailscale status --json | node -e 'let input=""; process.stdin.on("data", (chunk) => input += chunk).on("end", () => { const name = JSON.parse(input).Self?.DNSName; if (!name) process.exit(1); process.stdout.write(name.replace(/\.$/, "")); })')"
curl --fail --silent --show-error "https://${TAILNET_HOST}:3000/_kendall/runtime-health"
curl --fail --silent --show-error --unix-socket "$AUTH_DIR/supervisor.sock" http://localhost/internal/lan-auth/startup-gate
```

The HTTPS health check intentionally uses normal system trust against the
canonical MagicDNS hostname. It must succeed without `--insecure` or a
certificate override. The Unix-socket request is host-local evidence only; it
does not create, publish, or proxy a supervisor TCP endpoint.

Run this exact read-only manager handoff command **outside the Codex sandbox**
when sandbox process, Git, tmux, or workspace probes are unavailable:

```bash
node ./scripts/manager-resume-state.mjs --summary-json
```

Only if the status, HTTPS health, or private-UDS startup gate fails, inspect
the first failed command, then perform one paired recovery and re-run the
checks above:

```bash
pnpm run lan-cockpit:restart
pnpm run lan-cockpit:status
```

If the source preflight itself fails, stop and repair the checkout or its
dependencies before touching the running cockpit.

Stop instead of restarting when preflight configuration, certificate identity,
the canonical hostname, paired runtime revision, or the socket safety check is
rejected. Recover that configuration through the
[Authenticated LAN dashboard setup](authenticated-lan-dashboard-setup.md),
including its Tailnet recovery section; it is the authority for certificate,
systemd, and private-runtime repair.

Stop and ask for direction if recovery would require `--insecure`, reading or
printing a password/key/cookie/CSRF value, exposing or copying the private UDS,
or taking over an unknown or dirty managed lane. Preserve the evidence, inspect
the manager resume packet, and use the documented ownership/takeover workflow
rather than assuming a previous session's authority.

Local continuity artifacts, dated handoffs, and BMAD work products are not part
of the GitHub clean-install surface. Keep them under `_bmad-output/` or another
ignored local workspace path. If their decisions need to survive in Git, rewrite
the decision as source-owned docs, scripts, tests, or policy.

This runbook also anchors runbook verification for the active check chain.
Prepared lane handoffs must surface a resume packet with owner, branch,
worktree/dirty state, readiness status, next command, and takeover stop lines
through the runner assignment status report before another runner continues or
asks for takeover.
Autonomous best-judgment choices must be recorded through metadata-only heartbeat decision evidence.
Include the decision, rationale, and next safe action before the runner continues.

## Optional local Ollama review lane (reviewed source-VM approval)

The endpoint `http://192.168.1.128:11434/v1/chat/completions` and model
`qwen3:14b` are agreed route metadata, but they do not authorize a call. The
accepted 2026-06 approval records source VM `192.168.1.118`; the explicit
2026-08-15 authority decision selects only the later routed-source observation
`192.168.1.8`. The versioned
[`local-provider-authority-policy-v1.json`](./local-provider-authority-policy-v1.json)
record retains both as provenance while allowing only `192.168.1.8` as the
source VM for this exact bounded route.

The reviewed authority policy selects source VM `192.168.1.8`.

All local-provider and automatic-consent gates default false. Do not
enable the lane or probe the provider: source selection is not gate enablement.
Any future enablement requires a separate reviewed authority decision:

```bash
export SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS=false
export SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS=false
export SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE=false
export SUPERVISOR_OLLAMA_ENDPOINT_URL=http://192.168.1.128:11434/v1/chat/completions
export SUPERVISOR_OLLAMA_MODEL_ID=qwen3:14b
```

The local evidence explanation endpoint reports the applicable disabled-gate
reason and does not create automatic approval or call the adapter. To roll back
the source decision, restore the conflict-hold policy, keep the three flags
above `false`, restart the supervisor, and verify zero adapter calls.

Run `pnpm run check:fast` before long local or CI-style gates when changes touch
workflow policy, workspace delivery, sandbox-boundary handling, anti-churn
routing, dashboard E2E runners, or manager-control-plane verification. Use
`pnpm run check:ci-fast`, `pnpm run check:workspace-fast`,
`pnpm run check:sandbox-fast`, or `pnpm run check:dashboard-fast` for a narrower
first pass when only one surface changed.

For a managed lane whose changed paths are exclusively dashboard sources,
dashboard tests/configuration, dashboard runners, and documentation,
`finish-pr --verify scoped` selects `check:dashboard-delivery`. Its manifest
records that exact command after success. It is an explicit dashboard proof
that excludes unrelated workspace lifecycle fixtures; mixed or unknown paths
continue to use `check:fast`.

`pnpm run check` includes `pnpm run check:docs`,
`pnpm run check:fast`,
`pnpm run test:check-plan`,
`pnpm run test:supervisor-runner`,
`pnpm run test:supervisor:review-route`,
`pnpm run test:static-bundles`,
`pnpm run test:review-gated-low-risk-automation`,
`pnpm run test:review-gated-low-risk-fake-adapter`,
`pnpm run test:review-gated-low-risk-dry-run-adapter`,
`pnpm run test:review-gated-low-risk-read-only-review`,
`pnpm run test:review-gated-low-risk-bounded-write`,
`pnpm run test:review-gated-low-risk-pilot-admission`,
`pnpm run test:review-gated-low-risk-policy-eligibility`,
`pnpm run test:review-gated-low-risk-route-policy`,
`pnpm run test:metadata-only-provider-result`,
`pnpm run test:private-evidence-packet-policy`,
`pnpm run test:static-bundle-summary`,
`pnpm run check:governed-worker-execution-dry-run`,
`pnpm run check:documentation-authority`,
`pnpm run check:legacy-planning-inventory`,
`pnpm run check:review-resource-policy`,
`pnpm run check:verification-readiness`,
`pnpm run check:pipeline-implementation-readiness`,
`pnpm run check:dashboard-pipeline-boundary`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:authority-readiness`,
`pnpm run check:branch-protection-readiness`,
`pnpm run check:adaptive-scoring`,
`pnpm run check:premium-execution`, `pnpm run check:worker-launch`,
`pnpm run check:e2e-report`,
`pnpm run check:reports`, `pnpm run check:execution-boundary`,
`pnpm run check:execution-evidence`, `pnpm run check:provider-fixtures`,
`pnpm run check:process-lifecycle`, `pnpm run check:runbooks` for runbook
verification, `pnpm run check:runtime-export`, `pnpm run check:runtime-review`,
`pnpm run check:safe-backlog`, `pnpm run check:managed-recipes`,
`pnpm run check:maintenance-action-plan`, `pnpm run check:development-runway`,
`pnpm run check:runner-assignment-status`,
`pnpm run test:manager-quality-gate`,
`pnpm run test:manager-control-plane:contracts`,
`pnpm run test:manager-control-plane:focused`,
`pnpm run test:manager-control-plane`,
`pnpm run test:manager-control-plane-contract`,
`pnpm run test:manager-control-plane-dispatcher-port`,
`pnpm run test:manager-control-plane-forbidden-boundary`,
`pnpm run test:manager-control-plane-run-contract`,
`pnpm run test:manager-worker-clean-cycle-observer`,
`pnpm run check:manager-control-plane`,
`pnpm run check:manager-lifecycle-status-parity`,
`pnpm run test:runner-handoff-audit-json-validation`,
`pnpm run check:delivery-readiness`,
`pnpm run check:github-workflow-policy`,
`pnpm run check:cleanup-automation`,
`pnpm run check:maintenance-readiness`, `pnpm run check:token-economy`,
`pnpm run check:workspace-coordination`,
`pnpm run test:tmux-orientation-report`,
`pnpm run check:tmux-orientation-report`, `pnpm run check:mise-workflow`,
`pnpm run check:linux-install-lane`, `pnpm run check:bmad-work-products`,
`pnpm run check:knx-obsidian-memory`,
`pnpm run test:clean-install-boundary`, `pnpm run test:knx-obsidian-memory`,
`pnpm run test:work-packet-contracts`, `pnpm run test:work-packet-stage-map`,
`pnpm run test:work-packet-fixtures`, `pnpm run test:pipeline-state-matrix`,
`pnpm run test:dashboard-pipeline-fixtures`,
`pnpm run test:dashboard-memory-proposals`,
`pnpm run test:pipeline-implementation-readiness`,
`pnpm run test:live-memory-source-enforcement`,
`pnpm run test:bounded-live-memory-source`,
`pnpm run check:clean-install-boundary`,
`pnpm run test:codex-workspace`, `pnpm run test:sandbox-boundary-classifier`,
`pnpm run test:codex-workspace-state`,
`pnpm run test:workspace-command-resolution`,
`pnpm run test:anti-churn-event-writer`,
`pnpm run test:anti-churn-signature-classifier`,
`pnpm run test:anti-churn-event-reader`,
`pnpm run test:anti-churn-guidance-candidate-classifier`,
`pnpm run test:anti-churn-guidance-dedupe`,
`pnpm run test:anti-churn-guidance-output`,
`pnpm run test:anti-churn-verification-routing`,
`pnpm run test:anti-churn-apply-safe-gate`,
`pnpm run test:anti-churn-hook-transaction-store`,
`pnpm run test:anti-churn-source-apply`,
`pnpm run test:anti-churn-verification-rollback`,
`pnpm run test:dashboard-e2e-runner`, `pnpm run build:dashboard`,
`pnpm run test:supervisor-runner`, `pnpm run test:supervisor:review-route`, and
`pnpm run test:supervisor`.

`pnpm run test:supervisor:review-route` is the focused report-only Disclosure
Packet parity check. It validates no-provider route behavior without calling a
provider, invoking an adapter, or granting execution authority.
