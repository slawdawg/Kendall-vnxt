# Kendall_vNxt Authority Dependency Graph

Date: 2026-06-08
Status: planning baseline
Scope: Dependency gates for deferred execution authority

## Purpose

This graph defines what must be true before Kendall_vNxt can move from control-plane evidence into real worker execution authority.

The current implementation has routing, execution attempts, lifecycle state, approval binding, workspace isolation metadata, disabled configuration checks, runtime evidence export, and threat-boundary evidence. Those are prerequisites, not permission to launch workers.

## Authority Gates

| Deferred authority | Existing prerequisites | Missing prerequisites | Earliest safe next work |
| --- | --- | --- | --- |
| Local provider/model calls | Local provider registry entries, local read-only evidence packets, threat boundary, disabled config checks | Provider-specific prompt redaction tests, endpoint allowlist, timeout/cancel behavior, no-secret fixture tests, operator enablement policy | Provider enablement policy and mock provider boundary tests |
| Direct subscription-agent process launch | Subscription handoff packages, disabled launch stub, execution attempts, lifecycle transitions, approval binding, workspace isolation plans | Process supervisor, session/auth boundary, stdout/stderr capture, cancellation enforcement, per-job workspace, conflict detection, secret/session leakage tests | Process lifecycle design record and disabled adapter tests |
| Premium execution | Premium approval artifacts, route-bound attempt approvals, runtime evidence export | Premium provider contract, cost/quota policy, approval expiry, output evidence retention, fallback/rollback rules | Premium provider boundary PRD |
| Arbitrary shell command execution | Guarded utility worker, command-denied threat boundary, disabled command settings | Command allowlist taxonomy, quoting/path policy, timeout/cancel enforcement, output redaction, command audit log, rollback rules | Utility command policy document and non-executing command-plan artifacts |
| Source mutation by workers | Workspace isolation plans, recipe branch safeguards, stale branch guards | Per-attempt workspace materialization, patch capture, diff review, rollback command, conflict handling, approval gate | Workspace materialization design and patch-only dry run |
| Worker network access | Disabled network settings, threat boundary | Domain allowlist, request logging, payload redaction, retry/timeout policy, offline fallback, approval binding | Network boundary PRD |
| Credential access | Credential access explicitly denied | Dedicated credential scope, secret broker design, audit and revocation model, operator approval and recovery plan | Keep denied; no implementation without separate security PRD |
| Adaptive routing/scoring | Lane profiles, routing outcomes, execution attempt history | Larger audited outcome corpus, validation result taxonomy, override feedback, explainable scoring reports, rollback to deterministic scoring | Reporting-only outcome expansion |

## Dependency Flow

```text
Routing and lane evidence
  -> Execution attempts and lifecycle history
  -> Route-bound approval and workspace isolation metadata
  -> Disabled config checks and threat boundary
  -> Runtime evidence export and dashboard visibility
  -> Execution-readiness report and provider/command/source-specific enablement policy
  -> Provider-specific disabled adapter proof
  -> Operator-approved limited execution
  -> Outcome reporting
  -> Adaptive scoring, only after enough audited outcomes exist
```

No later node grants authority by itself. Each authority lane still needs a specific PRD or decision record before implementation can cross into real execution.

## Current Stop Line

The stop line remains before real execution.

Do not implement any of the following without a new explicit approval artifact:

- process launch for subscription agents,
- local or remote provider/model HTTP calls,
- premium provider calls,
- arbitrary shell command execution,
- worker source mutation,
- worker network access,
- credential or secret access,
- background runtime assistant behavior.

## Approved Work Below The Stop Line

The following work is safe to continue with conservative defaults:

- architecture dependency documentation,
- dashboard command/read boundary documentation,
- provider enablement policy documentation,
- execution-readiness reports,
- non-executing mock/disabled adapter contracts,
- queue lease and execution attempt boundary reports,
- process lifecycle design records,
- provider-specific disabled fixture policies,
- draft provider PRDs,
- approval-gated provider story breakdowns,
- draft subscription-agent launch PRDs,
- approval-gated subscription-agent launch story breakdowns,
- execution authority approval checkpoint rules,
- dashboard runtime evidence export access,
- dashboard evidence overview polish,
- reporting-only outcome evidence,
- tests proving disabled defaults and no side effects,
- dashboard and runtime evidence polish that does not add execution controls.

## Next Architecture Stories

1. Maintenance and hygiene.
2. Provider approval checkpoint before any Ollama execution story moves to ready.
3. Provider PRD review loop.
4. Read-only evidence polish.
