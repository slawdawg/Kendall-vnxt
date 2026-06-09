# Kendall_vNxt Dashboard Command Boundary

Date: 2026-06-08
Status: planning baseline
Scope: Dashboard read, record, approval, and execution-control boundaries

## Purpose

The dashboard is the operator control plane. It can show evidence and submit bounded supervisor commands, but it must not become an independent execution authority.

This boundary classifies dashboard actions so future UI work can add useful controls without implying that real workers, providers, commands, or source mutation are enabled.

## Boundary Classes

| Class | Meaning | Current examples | Requirements |
| --- | --- | --- | --- |
| Read-only evidence | Fetches supervisor state without mutation | work items, events, routing preview, worker registry, lane profiles, execution attempts, recipe gate audit | Must use GET-like supervisor endpoints and must not record events. |
| Record-only operator input | Records operator metadata or evidence without executing worker authority | assignment, escalation, saved views, delivery readiness evidence | Must show that the action records evidence or state only. |
| Workflow transition | Advances the work-item workflow through existing supervisor policy | workflow actions, retry, audit completion | Must rely on supervisor validation and event recording. |
| Guarded managed action | Asks supervisor to run a pre-existing deterministic managed action | managed next action for recipe flow | Must include stale-action binding such as `expectedActionId`. |
| Approval-bearing control | Records an approval decision for a specific bounded artifact or attempt | route-bound execution attempt approval, delivery gate readiness | Must bind to current route/action/attempt state and state what remains disabled. |
| Execution-prohibited display | Shows disabled future authority without offering a launch control | execution attempt panel, subscription-agent launch stub, local provider registry entries | Must not include buttons that start real processes, provider calls, shell commands, or source mutation. |

## Current Dashboard Surface Map

### Read-only Evidence

- `getRunStatus`
- `getWorkItems`
- `getWorkItem`
- `getWorkItemEvents`
- `getExecutionAttempts`
- `getExecutionRecipes`
- `getRecipeGateAudit`
- `getRoutingPreview`
- `getRoutingLaneProfiles`
- `getWorkerRegistry`
- `getAuditEvents`
- `getSavedOperatorViews`

### Record-Only Operator Input

- `saveOperatorView`
- `setOperatorViewDefault`
- `deleteOperatorView`
- `assignWorkItem`
- escalation updates from `EscalationPanel`
- delivery readiness updates from `DeliveryReadinessPanel`

### Workflow And Guarded Managed Actions

- workflow actions from `WorkItemActions`
- branch preparation from `BranchPreparationPanel`
- guarded managed next actions from `RecipeGateAuditPanel`

These commands are allowed only because the supervisor remains the system of record and enforces policy, stale-action checks, and workflow events.

## UI Copy Rules

Dashboard copy should:

- describe record-only commands as recording evidence, state, or operator decisions,
- describe guarded managed actions as supervisor-approved deterministic actions,
- state when process launch, provider calls, commands, source mutation, network access, or credential access remain disabled,
- avoid wording that implies background autonomy or direct worker execution is available before backend authority exists.

## New Control Checklist

Before adding a new dashboard control, identify:

1. Boundary class.
2. Supervisor endpoint and method.
3. Required binding fields, such as work item, route decision, attempt, worker, lane, authority mode, or expected action ID.
4. Whether the action records evidence or triggers behavior.
5. Safety flags that remain disabled.
6. Focused test coverage.
7. Stop condition if the control would cross into real execution.

## Stop Line

Do not add a dashboard control that can:

- launch subscription-agent processes,
- call local or remote model/provider endpoints,
- trigger premium execution,
- run arbitrary shell commands,
- mutate source through a worker,
- grant worker network access,
- read credentials or secret files,
- start background runtime assistant behavior.

Those controls require a separate PRD, threat-boundary update, provider/command policy, backend implementation, and tests before any UI affordance appears.
