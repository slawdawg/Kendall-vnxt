# Story 3.4: Connector-Backed GitHub Workflow Polish

Status: done
## Status

Ready for Review

## Story

As an operator,
I want a concrete connector-backed GitHub workflow,
so that Codex can push through Git Credential Manager and use the GitHub connector for PR work without falling back to local plaintext GitHub CLI tokens.

## Acceptance Criteria

1. The repo documents the supported auth split between Git/GCM, the Codex GitHub connector, and optional local `gh` auth.
2. The workflow includes a read-only connector readiness probe for `slawdawg/Kendall-vnxt`.
3. The fresh VM acceptance checklist requires the connector probe before accepting the VM for product work.
4. Bootstrap and handoff docs point operators to the connector workflow.
5. The full workspace check remains green.

## Implementation Notes

- Added `docs/github-connector-workflow.md`.
- Updated the fresh VM checklist with an explicit connector probe result.
- Updated bootstrap and Codex orientation docs to reference the connector workflow.
- Kept local GitHub CLI auth optional and did not add token storage or `gh` dependency.

## Verification

- GitHub connector read-only probe against `slawdawg/Kendall-vnxt` returned recent merged PRs.
- `pnpm run check`

## Safety Gates Upheld

- No plaintext GitHub CLI token is created.
- No GitHub CLI auth is required.
- No credential values are read or stored.
- No worker execution authority is enabled.
- No external model/provider setup is added.
