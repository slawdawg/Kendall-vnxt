# KNX IDE Workspace Planning Gate

Date: 2026-06-01

Status: accepted for local planning only

## Decision

Approve local-only planning for possible future IDE or workspace configuration.

IDE and workspace writes remain disabled by default.

This approval authorizes only local governance records, local planning evidence, local validation evidence, and local commits under the already approved KNX memory/runtime boundary.

## Approved Scope

- Define what an IDE or workspace configuration change would need to specify before implementation.
- Keep all IDE and workspace configuration writes disabled until a later explicit approval names exact targets and actions.
- Create local checklist and evidence artifacts under `_bmad/memory/knx/runtime/greenfield-implementation/ide-workspace/`.
- Record the gate outcome in KNX memory, backlog, handoff, daily log, and greenfield hard-gate plan.

## Required Future Fields

Any later IDE/workspace configuration approval must provide:

- IDE target.
- Exact file paths.
- Action, button, task, shortcut, or command behavior.
- Rollback plan.
- Validation plan.
- User-visible behavior.
- Safety contract for allowed and forbidden actions.

## Explicit Exclusions

This decision does not approve:

- `.vscode/` writes.
- `.idea/` writes.
- Workspace, task, launch, button, shortcut, or command files.
- Shell profile edits.
- Startup automation.
- Editor integration.
- Runtime assistant behavior.
- Service, daemon, scheduled task, or background helper installation.
- External sends or provider calls.
- Customer, production, credential, or account/security access.
- Source mutation outside already approved KNX paths.

## Validation

Validation for this gate is limited to:

- local documentation review,
- JSON parse validation,
- `git diff --check`,
- sensitive-pattern scan,
- local commit.

## Rationale

IDE/workspace configuration can create user-visible actions and execution shortcuts. Planning can proceed locally, but implementation must remain gated until exact behavior, paths, rollback, and safety controls are explicit.

