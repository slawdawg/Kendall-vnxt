# KNX Runtime Assistant Behavior Planning Gate

Date: 2026-06-01

Status: accepted for local planning only

## Decision

Approve local-only planning for possible future runtime assistant behavior.

Runtime assistant behavior remains disabled.

This approval authorizes only local governance records, local planning evidence, local validation evidence, and local commits under the already approved KNX memory/runtime boundary.

## Runtime Assistant Behavior Definition

For KNX governance purposes, runtime assistant behavior means any behavior that persists, triggers, schedules, observes, reads, writes, sends, routes, invokes tools, executes commands, or changes user-visible state outside the current explicit Codex task turn.

Examples include:

- background services or helper processes,
- scheduled or startup actions,
- event-triggered actions,
- persistent assistant state,
- automatic source intake,
- automatic validation or mutation,
- automatic external sends,
- editor, shell, or workspace actions that execute without a current explicit task.

## Approved Scope

- Define what runtime assistant behavior would mean before implementation.
- Keep all runtime behavior disabled until a later explicit approval names exact storage, triggers, execution context, user-visible behavior, rollback, validation, and safety contract.
- Create local checklist and evidence artifacts under `_bmad/memory/knx/runtime/greenfield-implementation/runtime-behavior/`.
- Record the gate outcome in KNX memory, backlog, handoff, daily log, and greenfield hard-gate plan.

## Required Future Fields

Any later runtime assistant behavior approval must provide:

- storage location and retention policy,
- trigger source and trigger conditions,
- execution context and permissions,
- user-visible behavior,
- rollback and disable plan,
- validation plan,
- safety contract,
- logging and evidence requirements,
- exact source and destination boundaries.

## Explicit Exclusions

This decision does not approve:

- runtime code,
- service or daemon installation,
- scheduled task or startup automation,
- persistent/live assistant state beyond approved records,
- automatic trigger handling,
- editor or shell integration,
- external sends or provider calls,
- customer, production, credential, or account/security access,
- source mutation outside already approved KNX paths.

## Validation

Validation for this gate is limited to:

- local documentation review,
- JSON parse validation,
- `git diff --check`,
- sensitive-pattern scan,
- local commit.

## Rationale

Runtime assistant behavior can create persistent, automatic, or user-visible effects beyond a single explicit task. Planning can proceed locally, but implementation must remain gated until storage, triggers, execution context, safety controls, rollback, and validation are explicit.

