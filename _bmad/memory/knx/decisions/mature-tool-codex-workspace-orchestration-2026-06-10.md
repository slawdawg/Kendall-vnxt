# Mature Tool Decision - Codex Workspace Orchestration

Last updated: 2026-06-10

## Decision Status

Status: accepted with narrow custom glue

Capability reviewed: mobile/SSH-friendly Codex workspace orchestration for starting, resuming, finishing, PR-ing, and cleaning up Git worktrees on a Windows VM without new paid services or routine GitHub Actions usage.

## Job To Be Done

Bob wants to use Codex mobile on iPad/iPhone, SSH sessions, and Windows desktop access to develop Kendall_Nxt from anywhere. The high-friction work is not implementation itself; it is naming branches and directories, creating worktrees, resuming the right workspace, committing, pushing, creating PRs, safely cleaning merged work, and keeping Git state clean.

## Research Questions

- Which mature local tools already solve workspace, branch, and PR lifecycle pieces?
- Which options avoid new paid services and routine GitHub Actions usage?
- Which options keep Git hygiene repo-owned and portable across Codex mobile, SSH, and desktop sessions?
- What custom code remains after mature Git and GitHub tooling are used?

## Options Considered

| Option | Fit | Risks | Status |
| --- | --- | --- | --- |
| Native `git worktree` | Strong fit for local worktree lifecycle: add, list, remove, prune, lock, move, repair | Requires wrapper policy for naming, cleanup safety, and task manifests | Accepted |
| GitHub CLI `gh pr` commands | Strong fit for PR create/status/merge checks from the VM without Actions minutes | Requires GitHub auth and explicit remote boundary; PR merge should remain guarded | Accepted |
| Local Git hooks and GitHub branch protection | Strong fit for hard blockers around protected branches | Hooks are local only; branch protection still needs GitHub settings | Accepted |
| Git Town | Mature branch lifecycle tool with hack/sync/propose/ship/undo/runlog capabilities | Branch-centric, not task-manifest/worktree-centric; may add workflow complexity | Deferred as optional pilot |
| GitHub Actions | Could automate cleanup signals after merge | Consumes finite usage minutes and moves routine orchestration off the VM | Rejected for routine orchestration |
| Paid external agent/control-plane apps | Could improve UI and continuity | New cost/service dependency; may make hygiene tool-dependent | Rejected for core hygiene model |
| Custom repo-owned Codex workspace glue | Can provide task manifests, naming, command contract, and safe state machine | Must stay thin and deterministic; avoid replacing Git/GitHub capabilities | Accepted narrowly |

## Fit Against Execution Policy

Fit: pass with concerns

The accepted path uses mature local tools first: Git, Git worktree, GitHub CLI, local hooks, and GitHub branch protection. Narrow custom glue is justified only for orchestration that mature tools do not own: task manifests, generated names, conversational command mapping, resume lookup, and safety gates.

Concerns:

- GitHub remote operations require explicit approval and repo-specific guardrails.
- Custom workflow code should remain deterministic and local.
- No GitHub Actions should be required for routine operation.

## Fit Against Data-Boundary Plan

Fit: pass with updated project reality

Earlier KNX records treated GitHub/remotes as disabled for the initial local governance baseline. This review is for the active Kendall_Nxt_new_work repository workflow, where the user has approved GitHub push/PR use for the project branch. The workspace protocol should still avoid using GitHub as live runtime state beyond normal branch and PR metadata.

Recommended task manifests should be local-first. If task state is written inside the repo, it must be ignored or intentionally reviewed before commit. A user-level workspace root such as `C:/Users/slaw_dawg/.codex-workspaces/Kendall_Nxt_new_work` is preferred for live task manifests.

## Cost Posture

Accepted core path adds no paid service and no routine GitHub Actions minutes.

GitHub CLI and GitHub PRs use the existing GitHub account and repo. External platforms remain optional and out of the core workflow.

## Security And Privacy Posture

The accepted path keeps execution on the Windows VM. GitHub receives only normal Git pushes and PR metadata when Bob explicitly finishes/publishes a task.

Hard blockers should include:

- no direct pushes to `main`/`master`,
- branch protection on GitHub,
- no cleanup of dirty, unpushed, or unmerged worktrees,
- explicit approval for PR merge,
- local manifests outside normal PR diffs by default.

## Maintenance And Dependency Posture

Git and GitHub CLI are mature and already aligned with the workflow. Git Town is mature enough to evaluate, but it may not reduce the specific worktree/task-manifest friction. Custom glue should be small enough to replace or delete later.

## Licensing Or Usage Constraints

No new package or service license is accepted for the core path. Git Town appears to be an open-source mature candidate, but install/use should be reviewed separately before adoption.

## Recommendation

Adopt a Codex Workspace Protocol built on mature tools:

- `git worktree` for workspace lifecycle,
- `gh pr` for PR create/status checks,
- local Git hooks and GitHub branch protection for hard blockers,
- `AGENTS.md` as the conversational command contract,
- a thin local script layer for task manifests, naming, start/resume/finish/cleanup state transitions.

Defer Git Town to an optional pilot only after the first repo-owned workflow exists or if branch lifecycle friction remains high.

Reject GitHub Actions and paid external platforms for the core hygiene model.

## Custom-Code Scope

Accepted narrowly:

- task manifest schema,
- local workspace root convention,
- task name and branch/folder slug generation,
- start/resume/list/checkpoint/finish/cleanup commands,
- safety checks around dirty state, upstream, PR status, and merged state,
- `AGENTS.md` workflow language.

Blocked or deferred:

- always-running daemon,
- paid service integration,
- routine GitHub Actions orchestration,
- automatic merge to `main` without explicit approval,
- deleting worktrees with uncommitted, unpushed, or unmerged work.

## Rollback Or Exit Path

The workflow can fall back to plain Git:

- `git worktree list`
- `git worktree remove`
- `git branch`
- `git status`
- `git push`
- `gh pr status`

If custom glue fails, manifests can be ignored and reconstructed from Git worktree and branch state.

## Evidence Links Or Local Source References

- Git worktree documentation: https://git-scm.com/docs/git-worktree
- GitHub CLI PR create documentation: https://cli.github.com/manual/gh_pr_create
- GitHub CLI PR status documentation: https://cli.github.com/manual/gh_pr_status
- Git Town hack documentation: https://www.git-town.com/commands/hack
- Git Town repository overview: https://github.com/git-town/git-town
- Local brainstorming session: `_bmad-output/brainstorming/brainstorming-session-2026-06-09-211128.md`

## Assumptions And Open Questions

Assumptions:

- Bob wants no added paid services.
- Codex mobile and SSH remain the primary remote interaction surfaces.
- Execution stays on the Windows VM.
- GitHub Actions minutes should not be spent on routine orchestration.

Open questions:

1. Should task manifests live under a user-level local root or under an ignored repo-local runtime path?
2. Should Git Town be installed and piloted after the minimal workspace protocol is defined?
3. Should PR merge remain manual in GitHub UI, or should Codex support explicit `merge PR` with confirmation?
4. Should the first implementation be PowerShell, Node, or both?
