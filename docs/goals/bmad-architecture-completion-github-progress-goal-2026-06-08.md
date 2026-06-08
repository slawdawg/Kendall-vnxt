# BMad Workflow Goal: Complete The Kendall_vNxt Architecture With GitHub-Current Progress

Date: 2026-06-08
Status: active goal
Owner: Kendall_vNxt operator and BMad delivery loop
Primary repo: `C:\Users\slaw_dawg\Kendall_Nxt`
Primary branch: `main`

## Goal

Complete the Kendall_vNxt architecture end to end through bounded BMad stories, while keeping GitHub current enough that the remote repo, issue/PR trail, and local story evidence always describe the same product reality.

The architecture is complete when the supervisor can safely plan, route, govern, observe, cancel, audit, and recover execution attempts across its approved lanes, with real worker authority enabled only after the required safety contracts, dashboard visibility, and GitHub-backed evidence are in place.

## Operating Principle

Every architecture increment must leave three things aligned:

- the implementation in `services/`, `apps/`, and `packages/`,
- the BMad source-of-truth artifacts in `docs/prds/`, `docs/architecture/`, `docs/stories/`, and `docs/handoffs/`,
- GitHub progress state through commits, pushed branches, PRs/issues when available, and concise status updates.

If those drift apart, the next workflow step is not more implementation. The next workflow step is reconciliation.

## Current Architecture Position

Completed foundation:

- Supervisor dynamic routing contract, preview, and event recording.
- Dashboard route explanation and routing fleet visibility.
- Worker capability/health registry with disabled provider evidence.
- Guarded utility routing for narrow deterministic supervisor work.
- Subscription handoff, premium approval, local read-only evidence, and disabled launch artifacts.
- Execution attempt contract and state model.
- Execution attempt lifecycle events and history API.
- Execution attempt approval binding and stale/mismatched decision rejection.
- Execution attempt workspace isolation plan contract.
- Dashboard execution attempt evidence panel.

Current local checkpoint:

- See `git log --oneline -5` for the latest local checkpoint.
- Latest completed architecture story trail: `docs/stories/2-5-dashboard-attempt-evidence-panel.md`.

Known GitHub sync issue:

- Non-interactive GitHub authentication failed during `git fetch` and `git push`.
- Until credentials are restored, local commits may be ahead of `origin/main`.
- Before depending on remote state, run `git fetch origin` and `git rev-list --left-right --count origin/main...HEAD`.

## Completion Definition

The architecture is considered complete for this BMad goal only when all of the following are true:

1. Execution authority expansion slices are implemented or explicitly deferred with decision records:
   - disabled execution configuration checks,
   - runtime evidence/export strategy,
   - threat boundary for commands, prompts, credentials, and local provider endpoints.
2. Supervisor behavior remains disabled-by-default for real subscription-agent launch, local provider/model calls, premium execution, arbitrary shell execution, source mutation, and background assistant behavior until later explicit approval.
3. Dashboard surfaces the operator evidence needed to understand route, worker, attempt, lifecycle, cancellation, disabled-state, and approval status.
4. Integration tests prove no provider/process/model/source-mutation side effects occur in disabled or mock phases.
5. `pnpm run check` passes at each completed story checkpoint, or any known failure is documented with an isolated rerun and a follow-up story.
6. Every completed story has:
   - story status updated,
   - Dev Agent Record updated,
   - File List updated,
   - Change Log updated,
   - verification commands recorded,
   - a small local commit.
7. GitHub reflects the same state through pushed commits and, when available, linked issues/PRs/projects.

## BMad Workflow Loop

Use this loop until the completion definition is met.

### 1. Reconcile

Before starting each story:

- Check `git status --short`.
- Check remote freshness with `git fetch origin` and `git rev-list --left-right --count origin/main...HEAD`.
- If GitHub auth blocks remote checks, record that in the active story or handoff before proceeding.
- Read the current PRD, architecture gap/reconciliation doc, previous story trail, and current tests.
- Confirm the next slice does not duplicate implemented routing, registry, handoff, premium, local evidence, or dashboard behavior.

### 2. Shape

Create or update one bounded story at a time.

Each story must include:

- operator-facing story statement,
- acceptance criteria tied to PRD/architecture requirements,
- tasks and subtasks,
- implementation constraints,
- verification plan,
- Dev Agent Record,
- File List,
- Change Log.

Stories must be small enough to commit independently and verify with focused tests plus `pnpm run check`.

### 3. Implement

Implement only the current story.

Default safety posture:

- no real Codex/Claude/Gemini/Antigravity process launch,
- no Ollama/LM Studio/vLLM/llama.cpp/local-provider HTTP calls,
- no OpenAI/model API calls,
- no premium execution,
- no arbitrary shell execution,
- no source mutation by execution attempts,
- no background runtime assistant behavior.

If a story needs to cross one of those gates, stop and create a decision record before implementation.

### 4. Verify

Run focused verification first, then broad verification.

Minimum expected checks for supervisor architecture stories:

- `uv run --directory services/supervisor python -m compileall src/supervisor`
- focused integration tests for the story
- relevant routing/supervisor integration suite
- `pnpm run check`

If a known flaky test fails in a broad run, rerun it in isolation and record both the failure and the isolated result in the story trail.

### 5. Record

After verification:

- Update story status and trail.
- Update architecture/PRD docs if the implementation changes architectural truth.
- Add a handoff note when GitHub sync, auth, or unfinished work could confuse the next session.
- Commit with a small, descriptive message.

### 6. Sync GitHub

After each clean local checkpoint:

- Push `main` or the active branch to `origin`.
- If using PRs, open or update the PR with:
  - completed story,
  - verification summary,
  - safety constraints upheld,
  - known gaps,
  - next recommended story.
- If using GitHub Issues or Projects, update the matching item status:
  - `Ready`,
  - `In progress`,
  - `Blocked`,
  - `In review`,
  - `Done`.
- If GitHub auth fails, do not pretend remote progress is current. Record the failure in the story/handoff and keep local status clean.

## Recommended Next Architecture Stories

### Story 2.3: Approval Binding And Stale Decision Rejection

Status: completed locally; pending GitHub sync.

Goal: require attempt-related approvals to bind to the current `routeDecisionId`, attempt ID where applicable, lane, worker, and authority mode.

Key acceptance:

- stale route decisions are rejected,
- mismatched worker/lane/authority approvals are rejected,
- approval evidence states what remains disabled,
- approval events link to attempts when attempts exist.

### Story 2.4: Workspace Isolation Plan Contract

Status: completed locally; pending GitHub sync.

Goal: attach a non-executing workspace isolation plan to execution attempts before mutation is ever allowed.

Key acceptance:

- read roots, write roots, artifact roots, forbidden paths, cleanup rules, and rollback strategy are represented,
- mutating attempts remain rejected,
- tests prove no source mutation occurs.

### Story 2.5: Dashboard Attempt Evidence Panel

Status: completed locally; pending GitHub sync.

Goal: make attempt state visible on the operator work-item surface.

Key acceptance:

- planned, rejected, cancel requested, cancelled, failed, timed out, completed, and disabled states are visually distinct,
- route binding and worker evidence are visible,
- copy does not imply autonomous execution is enabled.

### Story 2.6: Disabled Execution Configuration Checks

Goal: expose configuration evidence that subscription launch, local provider calls, and premium execution remain disabled by default.

Key acceptance:

- health/config surface reports disabled reasons,
- tests assert disabled providers do not launch processes, call HTTP/model endpoints, or mutate source.

### Story 2.7: Runtime Evidence Export Strategy

Goal: define and implement the first durable export path for operational attempt/event evidence.

Key acceptance:

- event and attempt evidence can be exported or backed up in a reviewable format,
- docs identify what remains local runtime state versus Git-backed evidence.

### Story 2.8: Threat Boundary For Commands, Prompts, Providers, And Secrets

Goal: formalize the safety boundary before any future real worker/provider execution.

Key acceptance:

- redaction boundary is explicit,
- credential access remains forbidden,
- network/provider access remains denied unless later policy approves it,
- command execution remains allowlisted and disabled outside existing guarded utility behavior.

## GitHub Progress Contract

GitHub is the public/remote progress ledger for this goal.

Each architecture checkpoint should produce one of:

- a pushed commit on `main`,
- a pushed branch plus PR,
- a GitHub issue/project update that points to the local blocker if push is impossible.

Recommended GitHub labels:

- `architecture`
- `bmad`
- `supervisor`
- `execution-authority`
- `safety-gate`
- `dashboard`
- `blocked:github-auth`

Recommended issue/PR update format:

```text
Story:
Status:
Commit:
Verification:
Safety gates upheld:
Known gaps:
Next story:
```

## Stop Conditions

Pause implementation and create a decision record if any story requires:

- real subscription-agent launch,
- local model/provider calls,
- premium execution,
- arbitrary shell execution,
- source mutation by workers,
- credential access,
- customer/production access,
- external sends,
- background runtime assistant behavior,
- destructive Git or filesystem operations.

## Immediate Next Step

Restore or confirm GitHub authentication, then push the local `main` checkpoints shown by `git log --oneline -5` to `origin/main`.

After Story 2.5 is committed and GitHub progress is current, begin Story 2.6: Disabled Execution Configuration Checks.
