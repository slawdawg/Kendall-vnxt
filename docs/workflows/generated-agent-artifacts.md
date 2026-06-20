# Generated Agent Artifacts

Date: 2026-06-19
Status: active guidance

## Purpose

Keep the remote repository focused on durable Kendall_Nxt source, policy,
contracts, and reviewed evidence. Do not let local IDE skill installs,
personal BMAD answers, or regenerated agent runtime trees become accidental
source of truth.

## Current Contract

`bmad-method` is the installer and generator for BMAD project skills. The
installed BMAD manifest currently declares both `codex` and `claude-code` as
IDE targets. BMAD maps those targets to:

- `codex`: `.agents/skills`
- `claude-code`: `.claude/skills`

The repo's active Codex guidance currently references `.agents/skills`. Treat
`.agents/skills` as a checked-in compatibility bundle until setup and agent
guidance are changed to regenerate it deterministically.

The `.claude/skills` tree is a local Claude Code target. Do not rely on a
tracked `.claude/skills` copy as source of truth. If Claude Code remains a
supported target, regenerate that tree with `bmad-method install --tools
claude-code` instead of preserving stale tracked copies.

Clean-install boundary: `.claude/skills/**` must not be tracked. It is
regenerate-on-demand local IDE state, while `.agents/skills/**` remains the
checked-in compatibility bundle until the Codex setup path is migrated.

## Source Of Truth

Keep these tracked unless a later migration replaces them deliberately:

- `_bmad/_config/manifest.yaml`
- shared `_bmad` module configuration and registries
- project-authored docs, stories, contracts, scripts, and tests
- `.agents/skills` while current bootstrap/docs still require it

Keep these local-only:

- `_bmad/config.user.toml`
- `_bmad/config.user.yaml`
- `_bmad/custom/config.user.toml`
- generated `.claude/skills`
- `_bmad-output/`
- generated root `skills/`
- BMad Builder custom creations under `_bmad-output/bmb-creations/`
- generated `.agents/skills/*/.decision-log.md`
- generated `.agents/skills/*/validation-report-*.md`
- BMAD-created work products:
  - PRDs
  - epics and stories
  - research packets
  - decision logs
  - handoffs
  - party-mode outputs
  - review notes
  - sprint plans and retrospectives
  - implementation-planning scratch artifacts

## BMAD Work Product Boundary

BMAD-generated planning and research artifacts are Kendall local work state.
They help the operator and agents decide what to build, but they are not automatically
GitHub repository source. Preserve them under `_bmad-output/` or another ignored
local workspace path.

Do not add BMAD work products to a PR simply because they are useful, complete,
or created during a BMAD workflow. A PR should include repo source, tests,
runtime policy, source-owned docs, or other durable product artifacts. BMAD
work products do not cross into the repo as generated artifacts. If a decision
from a BMAD artifact must become repository source, rewrite it as source-owned
docs, tests, scripts, or policy and keep the generated artifact local.

Do not use approval to track a generated BMAD artifact directly. Use approval
to create or update the source-owned repo artifact that captures the decision.

If BMAD work products were accidentally added to a branch:

1. Copy them to `_bmad-output/<lane-or-task>/` or another ignored local path.
2. Remove the repo-tracked copies from the branch.
3. Update or close the PR so GitHub history reflects the local-only boundary.
4. Do not delete the local worktree or local copies unless the operator explicitly asks.

`pnpm run check:bmad-work-products` and
`pnpm run check:clean-install-boundary` guard this boundary by checking policy
text, package wiring, and tracked local-only artifact additions. Tracked
`_bmad-output` files are not part of the clean install surface.

## Cleanup Rules

- Never remove generated agent trees because of size alone.
- Before removing an IDE skill tree, decide whether that IDE target is still
  supported or regenerate-on-demand.
- Before removing `.agents/skills`, update every Codex/BMAD reference and add a
  clean-clone regeneration check.
- Before shrinking `_bmad`, classify files as shared project config,
  installer/module state, project-authored KNX memory, or local runtime
  evidence. Do not bulk-delete `_bmad`.
- Remove personal config from Git tracking with `git rm --cached`; do not
  delete the operator's local copy unless explicitly requested.

## Review Checklist

Before any deletion PR that touches agent or BMAD artifacts:

- `bmad-method status` reports the expected modules.
- `bmad-method install --list-tools` confirms the intended IDE targets.
- `rg -n "\\.agents/skills|\\.claude/skills|_bmad/config.user" AGENTS.md docs scripts .github package.json`
  has no stale references to removed paths.
- Supported setup expectations are either still valid or intentionally updated.
- A rollback command is recorded in the PR body.
- The PR explains whether deleted files are local-only, generated, duplicated,
  or replaced by a regeneration path.

## Regeneration Notes

Use bounded approval before running mutating BMAD install commands. The base
Linux install path verifies `bmad-method` availability; it does not currently
run `bmad-method install` or rewrite BMAD project files.

## Related Inventories

KNX runtime cleanup inventories, evidence packets, approval packets, and
execution reports are local BMAD/Kendall workspace artifacts. Keep those
packets under ignored local output. If their decisions matter to the repo,
rewrite the decision into a source-owned artifact and keep the packet local.
