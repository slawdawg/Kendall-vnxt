# Kendall_vNxt Execution Readiness And Evidence Policy

Date: 2026-06-08
Status: accepted planning and implementation baseline
Scope: Provider enablement policy, attempt evidence reporting, and outcome evidence expansion

## Purpose

This policy defines the reporting layer that must stay in front of real execution authority.

Kendall_vNxt can now expose an execution-readiness report that joins provider enablement policy, disabled authority checks, recent execution attempts, and routing outcome evidence. The report is read-only. It does not approve provider calls, process launch, shell commands, source mutation, network access, credential access, premium execution, or adaptive scoring.

## Provider Enablement Ladder

A provider or execution lane can move from disabled capability to executable authority only after all of these gates are satisfied:

1. PRD or decision record: name the lane, provider, authority, scope, rollback, and stop conditions.
2. Threat-boundary update: define prompt, command, provider, network, credential, and artifact rules for the exact authority.
3. Settings and registry gate: runtime configuration and worker registry must agree on the enabled lane and leave unrelated lanes disabled.
4. Permission envelope: every attempt must bind route decision, worker, lane, authority mode, workspace isolation, redaction, artifact, and rollback evidence.
5. Operator copy and tests: dashboard text and focused tests must show what is enabled, what remains denied, and how to disable or roll back.

No single setting or registry health value is sufficient authority by itself.

## Readiness Report Contract

The supervisor owns `GET /supervisor/execution-readiness-report`.

The report includes:

- provider enablement policy steps,
- disabled execution authority checks,
- recent attempt summaries with disabled reasons and next safe action,
- latest routing outcome evidence as reporting-only records,
- next safe actions for operators,
- hard false capability flags for execution, provider calls, command execution, and source mutation.

The dashboard may display this report, but it must not add enablement controls until a later PRD explicitly approves them.

## Attempt Evidence Reporting

Attempt summaries should make repeated review easy:

- status,
- worker,
- lane,
- authority mode,
- disabled or failure reason,
- latest recorded event type,
- next safe action.

Terminal status is not authority. A completed, failed, cancelled, or rejected attempt remains evidence only unless a later approved implementation changes the underlying execution lane.

## Outcome Evidence Expansion

Outcome evidence remains reporting-only until enough audited outcomes exist for scoring work.

The report surfaces:

- selected lane,
- worker,
- task kind,
- attempt status,
- validation status,
- failure class,
- escalation reason,
- operator override reason when present.

Adaptive routing and score tuning remain deferred.

## Stop Line

Do not cross this policy into real execution without a new explicit approval artifact for the exact authority being enabled.

Still denied:

- subscription-agent process launch,
- local or remote provider/model calls,
- premium provider calls,
- arbitrary shell commands,
- worker source mutation,
- worker network access,
- credential or secret access,
- background runtime assistant behavior.

## Verification Expectations

Changes touching this report should prove:

- the endpoint is read-only and does not record workflow events,
- disabled authority checks remain false by default,
- provider policy steps are present,
- attempt and outcome summaries are populated from existing evidence,
- dashboard rendering does not introduce execution controls.
