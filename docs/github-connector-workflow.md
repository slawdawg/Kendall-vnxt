# GitHub Connector Workflow

Use this workflow when Codex needs GitHub PR inspection, PR creation, review metadata, or merge support without relying on local GitHub CLI authentication.

## Supported Auth Split

- Use Git Credential Manager with Windows DPAPI for ordinary `git fetch`, `git pull`, and `git push`.
- Use the Codex GitHub connector/app for repository inspection, PR reads, PR creation, review requests, draft/ready transitions, and other Codex-managed GitHub operations.
- Use local `gh` auth only for workflows that explicitly shell out to `gh`.

Do not keep a persistent `gh auth login --insecure-storage` token as a workaround for Git Credential Manager or connector problems.

## Connector Readiness Check

From a Codex session with the GitHub connector available, run a read-only repository probe:

```text
Use the GitHub connector to list the five most recent pull requests for slawdawg/Kendall-vnxt.
```

The probe is accepted when Codex can see recent PRs for `slawdawg/Kendall-vnxt` without asking for a local `gh` token.

Record the result in the session handoff or PR notes as:

```text
GitHub connector probe: passed; recent PRs visible for slawdawg/Kendall-vnxt.
```

If the connector is unavailable, do not switch to plaintext token storage. Use Git/GCM for ordinary branch pushes and pause connector-backed PR automation until the connector is restored.

## Delivery Flow

1. Confirm local state:

```powershell
git status --short --branch
pnpm run doctor:github -- --remote
```

2. Push the branch with Git/GCM:

```powershell
git push origin <branch>
```

3. Use the GitHub connector for PR creation or inspection.
4. Include local verification and connector probe status in the PR body.
5. Keep `gh auth status` warnings non-blocking unless the workflow explicitly requires `gh`.

## Failure Handling

- If Git remote commands fail with DPAPI or credential-store errors, recover through a visible interactive Windows session and Git Credential Manager.
- If connector reads fail, keep the branch pushed but do not create/update/merge PRs through a local token fallback.
- If both Git/GCM and the connector are unavailable, stop remote delivery and leave a local handoff with the branch, commit, verification status, and exact blocker.
