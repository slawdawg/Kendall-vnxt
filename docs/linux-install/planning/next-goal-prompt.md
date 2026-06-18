# Linux Install MVP Autonomous Goal Prompt

Status: active prompt seed
Date: 2026-06-18

## Purpose

Use this prompt when resuming autonomous work on the combined Linux Install MVP
lane. It keeps the PRD, epics/stories, implementation, verification, review,
and terminal delivery work in one lane so Bob does not need to recreate the
prompt each time.

## Prompt

```text
Complete the combined Linux Install MVP lane end to end, then continue through
the next required BMAD workflow steps until the lane is fully ready for terminal
delivery.

Primary lane artifacts:
- docs/prds/linux-install-mvp.md
- docs/prds/linux-install-mvp-decision-log.md
- docs/linux-install/planning/linux-install-architecture-input.md
- docs/linux-install/planning/linux-install-epics-and-stories.md
- docs/linux-install/planning/lane-status.md
- docs/linux-install/planning/next-goal-prompt.md
- docs/linux-install/planning/implementation-readiness-report-2026-06-18.md
- docs/linux-install/index.md
- docs/linux-install/install-playbook.md
- docs/linux-install/one-command-bootstrap-plan.md
- docs/linux-install/validation-matrix.md
- docs/linux-install/evidence/local-verify-only-20260618T181400Z.json

Operating rules:
- Treat tracked docs/evidence as the source of truth. Do not work from
  _bmad-output except as recovered provenance.
- Follow AGENTS.md and the relevant BMAD skills exactly when touching PRDs,
  architecture inputs, epics, stories, readiness checks, reviews, or
  implementation artifacts.
- Use party mode whenever possible for review or decision sections unless party
  mode has already been used for that exact section.
- Use best judgment for decisions unless the decision changes authority, safety,
  provider usage, source/data boundaries, secrets, paid usage, destructive
  cleanup, PR/merge behavior, or scope.
- Keep durable state in docs/linux-install/planning/lane-status.md.
- Prefer continuing safe independent work over stopping when one task is blocked.
- Do not create PRs until the end of the workflow unless the lane becomes too
  large or unsafe to review as one coherent change.
- Run code review before PR creation to reduce avoidable CI/review churn.
- Before PR creation, resolve or explicitly defer review findings in tracked
  evidence.
- After PR creation, monitor GitHub CI. When CI completes, inspect all PR
  comments and review threads, address every actionable comment, and mark
  resolved in GitHub before merge is considered.
- Auto-merge may be enabled, but do not rely on it until CI is green and all
  comments are resolved.
- Do not delete branches, clean worktrees, discard local state, or perform
  destructive cleanup without explicit matching approval.

Workflow:
1. Recover current state:
   - Check git status/diff.
   - Confirm current workspace with node ./scripts/codex-workspace.mjs
     resume/list as needed.
   - Read docs/ai-context/index.md for the smallest relevant context.
   - Confirm the Linux Install MVP lane artifacts are present and consistent.

2. Run BMAD readiness:
   - Use the appropriate BMAD readiness/check workflow.
   - Evaluate the promoted tracked PRD, architecture input, epics/stories,
     Linux docs, and evidence.
   - Write a tracked readiness report under docs/linux-install/planning/.
   - If readiness finds gaps, fix source artifacts first, then rerun or update
     the readiness report.
   - If readiness already exists, read it first and continue from its
     recommended next step.

3. Continue BMAD workflow:
   - If PRD needs finalization, follow bmad-prd to finalize or record why draft
     status remains correct.
   - If epics/stories need refinement, follow bmad-create-epics-and-stories.
   - If sprint planning is missing for this lane, create or refresh sprint
     planning before story creation.
   - If implementation stories need creation, follow bmad-create-story for the
     next execution-ready stories.
   - Maintain traceability from FR/NFR to epic/story to release gate to
     command/evidence.

4. Implement all remaining lane work:
   - Execute stories from
     docs/linux-install/planning/linux-install-epics-and-stories.md in
     dependency order.
   - Keep changes scoped to the Linux Install MVP.
   - Update docs, scripts, tests, evidence validators, release gates,
     troubleshooting, and lessons learned as needed.
   - Preserve the v1 boundary: Ubuntu 26.04+, existing non-root sudo user,
     local in-distro bootstrap only, no SSH/remote/staged/manual fallback as
     supported v1.
   - Preserve auth boundaries: no provider login, Codex/Claude login, Tailscale
     login, browser auth, token writes, private-key handling, or paid/provider
     calls unless separately approved.

5. Verify progressively:
   - Run the smallest relevant checks after each meaningful change.
   - At minimum for this lane, use:
     - node ./scripts/check-linux-install-lane.mjs
     - node ./scripts/check-doc-indexes.mjs
     - node ./scripts/check-linux-bootstrap.mjs
     - node ./scripts/check-linux-bootstrap-evidence.mjs <relevant evidence>
   - Broaden only when touched code requires it.
   - Record failed checks, root cause, fix, and final result.

6. Review before PR:
   - Run the repo-required BMAD code review workflow before PR creation.
   - Use party mode where useful and not already used for the section.
   - Fix critical/high findings before PR.
   - Record any intentionally deferred findings with rationale and owner.

7. Terminal delivery:
   - Only after workflows, implementation, verification, and review are
     complete, prepare one final PR.
   - Stage only intended files.
   - Create the PR using the repo workspace protocol.
   - Monitor GitHub CI.
   - When CI completes, inspect PR comments/review threads.
   - Address all actionable comments and mark resolved in GitHub.
   - Stop and ask Bob for explicit merge approval with a concise packet: PR
     link, CI result, comments resolved, review status, files changed, residual
     risks, and cleanup recommendation.
```

## Stop Lines

- Provider calls, paid usage, account auth, token writes, private-key handling,
  Tailscale enrollment, browser auth, reboot, destructive cleanup, PR merge, and
  worktree cleanup require separate matching authority.
- Generic "continue" language does not authorize new authority families.
