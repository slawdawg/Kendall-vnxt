# BMAD Brainstorming Input: Kendall NXT Pipeline Cockpit Operational Mode

**Owner:** Bob
**System:** Kendall NXT Framework / Kendall Supervisor Pipeline Cockpit
**Observed dashboard URL:** `http://192.168.1.8:3000/pipeline`
**BMAD workflow reference:** <https://docs.bmad-method.org/reference/workflow-map/>
**Dashboard screenshot to attach with this file:** `kendall_nxt_pipeline_dashboard_current.png`
**Purpose of this file:** Provide context for a BMAD brainstorming session that will choose the right workflow path and next development slice for the Pipeline Cockpit.
**Important instruction:** This is **not** a request to generate a full PRD, architecture, story, or implementation patch. Use it to start `bmad-brainstorming`, preserve exploration, and then recommend the next BMAD workflow.

---

## 1. How BMAD Should Use This File

Use this as a **brainstorming context packet**.

The goal is to help BMAD understand the current dashboard, the intended operating model, the safety posture, and the likely next decision space before committing to PRD, architecture, story creation, or implementation.

Recommended BMAD invocation:

```text
bmad-brainstorming

Use this file as the context_file if the workflow runner supports context files.
If context_file is not supported, paste this file during session setup as the project context.
```

Recommended brainstorming setup:

```text
Session topic:
How should Kendall NXT turn the current fixture-backed /pipeline dashboard into a real BMAD-aware workflow operations cockpit?

Session goals:
- Explore operating models for the cockpit.
- Decide whether the current lanes are right.
- Decide how BMAD workflows should sit underneath the dashboard.
- Identify the smallest backend-first slice that advances operational truth.
- Identify which BMAD workflow should run next after brainstorming.
- Avoid premature implementation or PRD ceremony.

Recommended technique approach:
4. Progressive Technique Flow

Reason:
Start broad enough to avoid locking onto the existing fixture model, then narrow into the first backend slice and workflow handoff.
```

BMAD should **not** start by writing a full PRD.

BMAD should **not** assume live execution should be enabled.

BMAD should **not** skip repo inspection if the codebase is available.

BMAD should keep the session generative until several operating models and failure modes have been explored. Do not collapse immediately into the first obvious slice.

BMAD should use this packet to decide whether the next best move is:

```text
- bmad-help for workflow selection after brainstorming
- bmad-generate-project-context if project context is missing or stale
- bmad-create-architecture if the source-of-truth/read-model decision needs a formal architecture record
- bmad-prd only if brainstorming shows the product surface is still underspecified
- bmad-create-epics-and-stories if enough direction exists for a backend-first implementation plan
- bmad-check-implementation-readiness before code changes if scope/risk is uncertain
- bmad-create-story or bmad-quick-dev only after the first slice is clearly bounded
```

Preferred brainstorming output:

```text
- Session summary
- Working assumptions
- 3 to 5 viable operating models
- Recommended operating model
- Backend-first slice recommendation
- What existing repo contracts should be reused
- What should remain fixture/dry-run/read-only
- Failure modes and guardrails
- Open questions for Bob
- Recommended next BMAD workflow and why
- Prompt for that next BMAD workflow
```

---

## 2. Operator Intent

Bob is building a dashboard/cockpit for what he is calling the **pipeline for the Kendall NXT Framework**.

The current dashboard is mostly fixture-backed and shows pipeline stages and status cards. Bob wants to move it into **operational mode** in a way that marries BMAD workflows underneath to the UI.

The desired direction is not simply “display BMAD workflows.”

The desired direction is:

```text
Turn the dashboard into an operational cockpit that can capture work, classify it, route it to BMAD or custom workflow steps, shape it into usable development/planning input, gate risky actions, show evidence, and eventually support controlled execution.
```

Bob is open to:

```text
- Adding more steps if the current lanes are missing something.
- Combining steps if the current lanes are too granular.
- Adding Kendall/Bob-specific steps on top of BMAD.
- Using existing tools instead of rebuilding solved problems.
- Developing this one safe slice at a time.
```

Bob does **not** want to jump directly into a heavyweight PRD or uncontrolled execution.

---

## 3. Current Dashboard Observations

Visible pipeline lanes:

```text
Capture → Classify → Route → Shape → Needs Approval → Execute → Review → Promote → Deliver → Learn
```

Visible status examples from the screenshot:

```text
Capture:
- stale source
- stale source

Classify:
- classify bmad planning
- classify bmad planning

Route:
- shape cockpit route
- shape cockpit route

Shape:
- model mismatch
- shape execution recipe
- model mismatch
- shape execution recipe

Needs Approval:
- approve cockpit
- approve cockpit
- approve cockpit
- approve cockpit

Execute:
- blocked
- hermes blocked
- worker failed
- blocked

Review:
- review blocked
- review pending
- review pending
- review completed worker

Promote:
- promote candidate

Deliver:
- deliver metadata-only evidence

Learn:
- memory proposal
- memory proposal
```

Visible top/dashboard status areas:

```text
Refill and bootstrap:
- 3 safe items available
- allowed_unattended
- read-only in dashboard
- next: continue_monitoring

Worker pool:
- 1 running / 1 leased from summary counts
- requires_preauthorization
- live workers/session control unavailable without live_worker authority
- next: continue_monitoring

Resource and usage:
- summary_only
- allowed_unattended
- detailed resource and usage unavailable in summary
- next: continue_monitoring

Operator feedback routing:
- metadata_only_feedback_record
- unrelated lanes: continue_unrelated_safe_lanes
- retention: metadata_only; rawPayloadRetained false
- no operator feedback routes are present in this summary
```

Important interpretation:

```text
- The dashboard already has useful operational language.
- It already distinguishes safe/unattended work from preauthorized work.
- It already exposes blocked states.
- It already has an Evidence and Checkpoint Drawer.
- It already hints at summary-only governance and metadata-only retention.
- The first development problem is probably the state/data contract, not visual design.
- The visible “model mismatch” state suggests the UI and backend/fixture model are not aligned yet.
```

Current repo-grounded update:

```text
The original "define a WorkItem contract" concern is partly addressed in the repository already.

Known existing pieces:
- packages/contracts/src/api.ts contains WorkItemView and related work item API types.
- packages/contracts/src/work-packet.ts contains PipelineStage, WorkPacket, source refs, evidence refs, retention classes, model policies, and packet projection concepts.
- packages/workflow-core/src/work-packet-stage-map.ts contains stage projection rules from Candidate Work, WorkItem, routing previews, execution attempts, delivery evidence, and memory proposals.
- services/supervisor contains real WorkItem, WorkflowEvent, AuditEvent, ExecutionAttempt, routing, evidence, and worker-related service code.
- apps/dashboard/src/app/pipeline/page.tsx currently reads pipelinePacketsWithPersistedGovernedWorkerEvidence(), which means /pipeline is still largely fixture/projection-backed from local evidence rather than a clean live operational backend read model.

Therefore, the brainstorming should not start from "invent WorkItem."
It should explore how to connect existing contracts and supervisor state into a durable Pipeline Cockpit read model without enabling live execution prematurely.
```

---

## 4. Product Direction to Align Around

Do **not** build this as “BMAD inside a UI.”

Build it as:

```text
A BMAD-aware workflow operations cockpit.
```

BMAD remains the method and workflow engine underneath for thinking, planning, architecture, stories, implementation loops, review, and retrospectives.

The Kendall NXT dashboard becomes the control layer:

```text
1. Capture incoming work.
2. Classify what kind of work it is.
3. Route it to a BMAD workflow or Kendall-specific workflow.
4. Shape messy input into workflow-ready input.
5. Gate risky work behind approvals.
6. Execute approved workflow steps later, not immediately.
7. Review outputs.
8. Promote accepted artifacts.
9. Deliver final artifacts or updates.
10. Learn by proposing approved rule/context/memory updates.
```

The dashboard should answer these questions for every work item:

```text
1. What came in?
2. What does the system think it is?
3. Which workflow should handle it?
4. What evidence, artifact, approval, or human input is needed next?
5. What changed, where is the output, and what should be learned?
```

---

## 5. Key Principle: Do Not Let the Frontend Invent Workflow Truth

The frontend should display projected state from a backend source of truth.

Lane labels, card states, blocked reasons, artifact links, approval states, and evidence should come from real state/event records, not disconnected fixture labels.

Recommended conceptual layers:

```text
UI Layer
- Board lanes
- Work queue
- Detail drawer
- Approval controls
- Evidence/checkpoint drawer
- Artifact links
- Work item history

Workflow Orchestration Layer
- State machine
- Classifier
- Router
- Approval policy model
- Worker/runner adapter later
- Retry/resume logic later
- BMAD workflow adapter later

Source-of-Truth Layer
- Database or event log
- Git repo
- _bmad-output artifacts
- project-context.md
- Worker/session logs
- Approval records
```

BMAD should help determine what source of truth is most appropriate for the current codebase.

---

## 6. Suggested Mapping: Dashboard Lanes to Workflow Responsibilities

Keep the current dashboard lanes as the operational lifecycle unless BMAD finds a strong reason to change them.

Use BMAD phase/workflow details as metadata underneath each work item.

| Dashboard Step | Operational Meaning | BMAD Relationship |
|---|---|---|
| Capture | Intake a request, file, prompt, issue, email, webhook, repo signal, or operator-created task | No BMAD yet; preserve source and metadata |
| Classify | Decide if this is an idea, research task, PRD-type task, UX task, architecture task, story, quick fix, review, documentation, etc. | Maps to BMAD workflow options |
| Route | Select workflow, agent, artifact path, approval policy, and execution mode | Chooses BMAD or custom workflow |
| Shape | Convert messy input into workflow-ready input | Produces a small intent/spec/story input, not necessarily a PRD |
| Needs Approval | Human gate before risky work | Required before code execution, external publishing, credential use, memory updates, or broad file writes |
| Execute | Run approved BMAD/Codex/backend task | Later phase; keep disabled/dry-run first |
| Review | Validate output, code, artifact, or decision | BMAD review/readiness/code-review style step |
| Promote | Move candidate output to accepted state | Commit, PR, accepted artifact, ready-for-build, ready-for-use |
| Deliver | Export/share final artifact | Markdown, issue, PDF, dashboard update, email draft, etc. |
| Learn | Propose memory/project-context/rule updates | Proposal only; never silently auto-apply |

---

## 7. Seed Hypothesis for Brainstorming

This is not a final decision. Treat this as a starting hypothesis for brainstorming and challenge it against alternatives.

### Seed Slice Name

```text
Backend-Backed Pipeline Read Model
```

### Why this may be first

The screenshot shows `model mismatch`, blocked execution, fixture-backed behavior, and evidence/checkpoint surfaces that should be anchored in real state.

The repo already has WorkItem and WorkPacket contracts, so the likely foundational problem has shifted:

```text
The app needs a reliable backend read model that projects real supervisor state into the Pipeline Cockpit before it needs live execution.
```

### Goal

Create the minimum backend/frontend path needed for `/pipeline` to represent real operational work items, events, evidence, and authority state while preserving fixture fallback and keeping execution disabled.

### In Scope

```text
- Locate current /pipeline route and fixture data.
- Locate existing WorkItem, WorkPacket, stage projection, evidence, and supervisor state models.
- Decide whether the cockpit read model should be served by supervisor, generated from artifacts, or hybrid.
- Define a canonical PipelinePacket read model only if the existing WorkPacketV0View is insufficient.
- Reuse existing stage projection rules where possible.
- Add or identify a backend read endpoint/projection path for real Candidate Work, WorkItem, events, attempts, evidence, approval/authority state, and memory proposals.
- Make fixture, persisted-evidence, dry-run, and operational read modes explicit in the UI.
- Keep fixture mode as a fallback and comparison set.
- Wire the Evidence and Checkpoint Drawer to real state/evidence records where feasible.
- Add tests around real-state-to-pipeline projection and fixture compatibility.
```

### Out of Scope

```text
- Running BMAD workflows from the browser.
- Running arbitrary shell commands.
- Enabling unattended development.
- External publishing.
- Auto-updating project-context or BMAD custom files.
- Adding Temporal/Prefect/LangGraph or other orchestration dependency unless a decision record justifies it.
- Building a complete multi-user permission system.
```

### Success Criteria

```text
- The dashboard can render at least one pipeline packet from real supervisor-backed state or a clearly identified persisted operational source.
- The existing fixture data still works as fallback/comparison data.
- The UI clearly indicates fixture, persisted-evidence, dry-run, or operational mode.
- A pipeline packet has source, state, lane/stage, status, blocked reason, next action, artifact refs, approval/authority flags, and evidence refs.
- Blocked/model mismatch states explain the mismatch and next action with source-specific reason codes.
- The Evidence and Checkpoint Drawer can show a timeline or evidence records for a selected item.
- No live execution is enabled.
```

---

## 8. Legacy Draft Shape for Context Only

This shape came from early alignment thinking. Do not treat it as the target schema. The repo already has `WorkItemView`, `WorkPacketV0View`, evidence refs, stage mappings, execution attempts, and supervisor state. Use this only to understand the intended information architecture.

```yaml
work_item:
  id: "nxt-2026-000123"
  title: "Operationalize BMAD workflow routing in dashboard"

  source:
    type: "operator"              # operator | file | issue | email | webhook | repo | system
    ref: "manual-entry"
    captured_at: "2026-07-01T00:00:00Z"
    raw_payload_retained: false
    metadata_only: true

  classification:
    intent: "workflow-operations"
    confidence: 0.82
    recommended_track: "bmad-alignment"
    recommended_workflow: "bmad-brainstorming first, then route to architecture/story/readiness as appropriate"
    risk_level: "medium"
    summary: "Request is about turning fixture dashboard into operational workflow cockpit."

  route:
    lane: "shape"
    workflow: "brainstorming-seed"
    execution_mode: "read-only"    # fixture | persisted-evidence | dry-run | operational-read | operator-approved
    approval_policy: "requires_preauthorization"

  artifacts:
    - id: "art-001"
      type: "alignment-input"
      path: "_bmad-output/alignment/kendall-nxt-pipeline-cockpit.md"
      status: "draft"

  approvals:
    required: false
    policy: "none_for_alignment_only"
    status: "not_required"

  state:
    current: "shaped"
    lane: "shape"
    blocked: false
    blocked_reason: null
    next_action: "Use BMAD brainstorming to choose the operating model and next workflow."

  evidence:
    - event_id: "evt-001"
      summary: "Captured operator request from conversation."
    - event_id: "evt-002"
      summary: "Identified backend-backed pipeline read model as current seed hypothesis."
```

Do not treat this schema as final. Treat it as context for brainstorming.

---

## 9. Suggested State Terms for Brainstorming

Primary flow candidate:

```text
captured
classified
routed
shaped
approval_pending
approved
executing
review_pending
review_completed
promoted
delivered
learning_proposed
done
```

Side/terminal states candidate:

```text
blocked
failed
rejected
needs_input
canceled
stale_source
model_mismatch
worker_unavailable
approval_required
delivery_unavailable
```

BMAD should inspect or reference the repo before changing these. If the repo already has a better state model, reuse it or reconcile the terms instead of creating a parallel lifecycle.

---

## 10. Repo Inspection Checklist

If Codex/BMAD has access to the repository, inspect these before writing implementation instructions. For brainstorming, use this checklist to identify the highest-leverage uncertainty rather than exhaustively reading the repo.

```text
1. What frontend framework is used?
   - React?
   - Next.js?
   - Vite?
   - Other?

2. What backend framework is used?
   - FastAPI?
   - Express?
   - Next API routes?
   - Other?

3. Where is the /pipeline route implemented?

4. Where are the current fixture files?

5. What data model currently backs the dashboard cards?

6. What produces status values like stale_source, model_mismatch, blocked, review_pending, etc.?

7. Where are WorkItemView, WorkPacketV0View, stage mapping, and pipeline fixture projection implemented?

8. Is there already a database?

9. Is there already an event log or audit log?

10. Is there already a worker/lease model?

11. Is the worker pool real, fixture-derived, or hybrid?

12. Is the Evidence and Checkpoint Drawer wired to real records, fixtures, or placeholder data?

13. Are BMAD workflows currently invoked from this app, or only represented in UI labels?

14. Are there existing directories like _bmad-output, project-context.md, or _bmad/custom?

15. Is there an existing CLI wrapper or service for BMAD commands?

16. Are there test files already covering the dashboard state model?
```

---

## 11. Open Questions BMAD Should Resolve or Ask Bob

Do not block forever on these, but call them out.

```text
1. For the cockpit read model, should supervisor database/event log be the source of truth, with Git storing code/artifacts?

2. Should Git and _bmad-output remain artifact sources that supervisor indexes/projects, rather than direct UI truth?

3. Should the first operational mode be read-only from supervisor state, persisted-evidence backed, dry-run, or limited-write to approved artifact paths?

4. Should a work item be allowed to create files directly, or should it prepare candidate artifacts for review first?

5. Which first BMAD workflow should eventually be connected to the cockpit?
   Candidate answer: intake/candidate-work creation and read-only workflow routing before execution.

6. Should raw source payloads ever be retained?
   Current dashboard suggests metadata-only and rawPayloadRetained false.

7. Should approval/authority policy be global, per workflow, per risk level, per operator, or per standing lane profile?

8. Is this Bob-only for now, or should the data model assume future roles like operator, reviewer, approver, and admin?

9. What exactly is “Hermes” in the current Execute lane?

10. Is “model mismatch” coming from data validation, UI card shape, API response shape, or fixture/operational schema drift?
```

---

## 12. BMAD Brainstorming Kickoff Prompt

Paste this into BMAD first, or pass this file as the brainstorming `context_file` if the runner supports it.

```text
Use BMAD brainstorming for the Kendall NXT Pipeline Cockpit.

Important:
Do not generate a full PRD, architecture, story, or implementation patch yet. I need a brainstorming session that explores the operating model and selects the right next BMAD workflow.

Current situation:
The dashboard at /pipeline is currently fixture-backed or partially fixture-backed. It shows lanes for Capture, Classify, Route, Shape, Needs Approval, Execute, Review, Promote, Deliver, and Learn.

The repo already has some relevant building blocks:
- WorkItemView and related API types.
- WorkPacketV0View, source refs, evidence refs, retention classes, and pipeline stage concepts.
- Stage mapping from Candidate Work, WorkItem, routing preview, execution attempts, delivery evidence, and memory proposals.
- Supervisor service code for WorkItem, events, audit, execution attempts, routing, evidence, and worker state.

The open problem is probably not "invent a WorkItem contract from scratch."
The open problem is how to move /pipeline from fixture/projection-backed cards toward a real backend-backed operational read model while keeping execution gated and safe.

Intent:
Turn this dashboard into a BMAD-aware workflow operations cockpit. BMAD should remain the backend method/workflow layer. The dashboard should become the control tower that captures work, classifies it, routes it, shapes it, gates risky actions, shows evidence, and later supports controlled execution.

Session setup:
Topic:
How should Kendall NXT turn the current /pipeline dashboard into a real BMAD-aware workflow operations cockpit?

Goals:
1. Explore 3 to 5 possible operating models.
2. Decide how BMAD workflows should sit underneath the dashboard without making the UI a BMAD clone.
3. Decide whether the current lanes are right or need adjustment.
4. Decide what source of truth should drive the cockpit read model.
5. Identify the smallest backend-first slice that creates real operational truth.
6. Identify the next BMAD workflow after brainstorming.

Recommended approach:
Use Progressive Technique Flow.

Seed hypothesis to challenge:
Backend-Backed Pipeline Read Model.

This likely means:
- /pipeline should consume real supervisor-backed or persisted operational state.
- Existing fixture packets should remain as fallback/comparison data.
- Existing WorkItem/WorkPacket/stage mapping contracts should be reused where possible.
- The UI should clearly distinguish fixture, persisted-evidence, dry-run, and operational read modes.
- Evidence and checkpoint surfaces should connect to real events/evidence records when available.
- No live execution should be enabled by this slice.

Do not:
- Enable unattended development.
- Run arbitrary shell commands.
- Add heavy orchestration dependencies without a decision record.
- Auto-update memory/project-context/custom BMAD config.
- Collapse immediately into implementation.
- Create a parallel state model if existing contracts can be reconciled.

Output format:
- Brainstorming session summary
- Working assumptions
- 3 to 5 operating models
- Recommended operating model
- Backend-first slice recommendation
- Existing repo contracts to reuse
- What remains fixture/dry-run/read-only
- Failure modes and guardrails
- Open questions for Bob
- Recommended next BMAD workflow and why
- Prompt for that next BMAD workflow
```

---

## 13. Brainstorming Exploration Areas

During brainstorming, explore these areas before converging:

```text
- Whether the current lanes are the right operational lifecycle.
- Whether any lanes should be combined or added.
- How BMAD workflows should sit underneath the UI without the UI becoming a BMAD clone.
- How Capture, Classify, Route, and Shape should work in the first safe version.
- How approval and evidence should work.
- How fixture mode should transition into dry-run and operational modes.
- What should not be built because existing tools already solve it.
- Whether supervisor, Git/_bmad-output, or a hybrid projection should be cockpit truth.
- How operator feedback and approvals should become state transitions.
- How memory/project-context learning should remain proposal-only.
- What failure modes would make the cockpit misleading.
- What the smallest backend-first slice should be.
```

---

## 14. Post-Brainstorm Workflow Handoff

After brainstorming, do not jump straight into code unless the output clearly supports it. Route to one of these workflows:

```text
- bmad-help:
  Use if the main uncertainty is which workflow comes next.

- bmad-create-architecture:
  Use if the main uncertainty is source of truth, backend read model, event flow, authority model, or integration boundary.

- bmad-prd:
  Use only if the cockpit product behavior remains underspecified after brainstorming.

- bmad-check-implementation-readiness:
  Use if the slice looks plausible but requirements/architecture/test evidence may be incomplete.

- bmad-create-story:
  Use if the slice is already bounded and has enough architecture/context to create an implementation story.

- bmad-quick-dev:
  Use only if the slice is small, low risk, and clearly implementation-ready.
```

---

## 15. Draft Codex Prompt Template After BMAD Chooses the Slice

Use this only after BMAD brainstorming and the follow-on workflow produce an approved slice.

```text
You are working in the Kendall NXT Framework repository.

Read the BMAD brainstorming output and the follow-on BMAD workflow output. Implement only the approved next slice.

Current seed direction:
Backend-Backed Pipeline Read Model.

Do first:
1. Inspect the /pipeline route.
2. Locate fixture data, pipeline packet model types, and stage projection logic.
3. Locate supervisor WorkItem, WorkflowEvent, AuditEvent, ExecutionAttempt, routing, evidence, and worker state.
4. Locate Evidence and Checkpoint Drawer implementation.
5. Summarize the current data flow before changing code.

Likely implementation shape, if approved:
- Reuse existing WorkItem/WorkPacket/stage mapping contracts where possible.
- Add or refine a backend read projection for pipeline packets from real operational state.
- Preserve fixture mode as fallback/comparison data.
- Make fixture, persisted-evidence, dry-run, and operational read modes visible.
- Wire selected packet evidence/checkpoints to real state/evidence records where feasible.
- Add tests for real-state-to-pipeline projection and fixture compatibility.

Do not:
- Enable live BMAD execution.
- Add runner/worker execution.
- Add arbitrary shell command execution.
- Add heavy orchestration dependencies.
- Remove fixture mode.
- Create a parallel lifecycle when existing contracts can be reconciled.
- Rewrite the dashboard UI unnecessarily.

Before coding, provide:
- Files likely to change.
- Existing model summary.
- Proposed minimal changes.
- Risks.

After coding, provide:
- Change summary.
- Test results.
- Remaining gaps.
- Recommended next slice.
```

---

## 16. Guardrails for This Project

Keep these guardrails in place until Bob explicitly changes them:

```text
- Human approval before code execution.
- Human approval before broad file writes.
- Human approval before external publishing.
- Human approval before credential usage.
- Human approval before memory/project-context/BMAD customization updates.
- Raw payload retention disabled by default.
- Every state transition should eventually be traceable.
- Every worker action should eventually tie back to a WorkItem ID.
- Fixture mode, dry-run mode, and operational mode should be clearly distinguishable.
```

---

## 17. Current Best Bet

The most likely correct next brainstorming conclusion is:

```text
Backend-Backed Pipeline Read Model
```

Reason:

```text
The dashboard already has the right high-level lanes and the repo already contains many of the contract pieces. The problem is not that BMAD needs a PRD or that Kendall needs a brand-new WorkItem model. The problem is that /pipeline still needs a trustworthy read model that projects real operational state, evidence, authority, and workflow status into the cockpit without confusing fixture data for truth.
```

BMAD should use brainstorming to challenge this against other operating models and then route to the next workflow:

```text
- bmad-create-architecture if the source-of-truth/read-model boundary needs a design decision.
- bmad-check-implementation-readiness if the slice seems right but evidence is incomplete.
- bmad-create-story if the slice is already bounded enough for implementation.
- bmad-prd only if the brainstorming reveals missing product definition.
```
