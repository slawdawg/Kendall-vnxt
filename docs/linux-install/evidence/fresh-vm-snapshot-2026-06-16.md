# Fresh VM Snapshot Evidence

Date: 2026-06-16
Target alias: `kendall-linux`
Target user: `slaw_dawg`
VM/display identity: `Kendall_vNxt`
OS hostname observed: `kendallvnxt`

## Scope

Bob confirmed a VM snapshot was taken after:

- Toolchain verification.
- Manual GitHub auth.
- Repo clone and setup.
- Full `pnpm run check`.
- Reboot proof.
- Real Linux work-cycle proof.

## Result

Snapshot taken.

## Recovery Meaning

The VM now has a recovery point after the full Linux baseline proof. If later
tooling, auth, repo state, or package changes break the environment, recovery
can start from this known-good snapshot instead of rebuilding from scratch.

## Remaining Decision

A later gap review found Codex CLI and Claude Code were missing from the
baseline requirements; those agent CLIs were subsequently installed and
verified. Decide whether `kendall-linux` is now the primary Kendall_Nxt
development baseline and define provider-login policy.
