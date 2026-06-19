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

The repo's active Codex guidance and Windows bootstrap verification currently
reference `.agents/skills`. Treat `.agents/skills` as a checked-in compatibility
bundle until bootstrap and agent guidance are changed to regenerate it
deterministically.

The `.claude/skills` tree is a local Claude Code target. Do not rely on a
tracked `.claude/skills` copy as source of truth. If Claude Code remains a
supported target, regenerate that tree with `bmad-method install --tools
claude-code` instead of preserving stale tracked copies.

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
  delete Bob's local copy unless explicitly requested.

## Review Checklist

Before any deletion PR that touches agent or BMAD artifacts:

- `bmad-method status` reports the expected modules.
- `bmad-method install --list-tools` confirms the intended IDE targets.
- `rg -n "\\.agents/skills|\\.claude/skills|_bmad/config.user" AGENTS.md docs scripts .github package.json`
  has no stale references to removed paths.
- Windows bootstrap expectations are either still valid or intentionally
  updated.
- A rollback command is recorded in the PR body.
- The PR explains whether deleted files are local-only, generated, duplicated,
  or replaced by a regeneration path.

## Regeneration Notes

Use bounded approval before running mutating BMAD install commands. The base
Linux install path verifies `bmad-method` availability; it does not currently
run `bmad-method install` or rewrite BMAD project files.
