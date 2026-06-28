import type { ReactNode } from "react";
import Link from "next/link";
import type { PipelineFixturePacket, PipelineGoldenPathSnapshot, SourceBoundaryDeclarationV0 } from "../../lib/pipeline-fixtures";

export function PacketDetailPage({
  packet,
  snapshot,
  sourceBoundaries,
}: {
  packet: PipelineFixturePacket;
  snapshot: PipelineGoldenPathSnapshot | null;
  sourceBoundaries: SourceBoundaryDeclarationV0[];
}) {
  return (
    <main className="grid max-w-full min-w-0 gap-4" aria-label="Packet detail">
      <section className="pipeline-nohype-shell rounded-[0.5rem] border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="rounded-[0.375rem] border bg-[var(--surface)] px-2 py-1 text-xs text-[var(--accent)]" href="/pipeline">
            Back to pipeline
          </Link>
          <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{packet.currentStage}</span>
          <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{packet.currentOwner}</span>
          <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{packet.fixtureLabel}</span>
        </div>
        <h1 className="mt-3 break-words text-2xl font-semibold">Packet detail: {packet.title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{snapshot?.whatPacketIs ?? packet.summary}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Stage" value={packet.currentStage} />
          <SummaryTile label="Owner" value={packet.currentOwner} />
          <SummaryTile label="Next decision" value={packet.nextAction} />
          <SummaryTile label="Risk" value={packet.riskLevel} />
        </div>
      </section>

      <section aria-label="Packet 5 Whys" className="grid gap-3 rounded-[0.5rem] border bg-[var(--panel)] p-4 md:grid-cols-2 xl:grid-cols-5">
        <DetailBlock title="What is this?" body={snapshot?.whatPacketIs ?? packet.summary} />
        <DetailBlock title="Why is it here?" body={snapshot?.whyHere ?? packet.routeFork.sourceContext} />
        <DetailBlock title="Where is it?" body={`${packet.currentStage} stage; ${packet.currentOwner} owns the next move.`} />
        <DetailBlock title="What proof exists?" body={`${packet.evidenceRefs.length} evidence refs, ${packet.artifactRefs.length} artifact refs, ${packet.sourceRefs.length} source refs.`} />
        <DetailBlock title="What happens next?" body={snapshot?.whatHappensNext ?? packet.nextAction} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="Route">
          <FieldList
            fields={[
              ["Selected route", packet.routeFork.selectedRoute],
              ["Rejected routes", packet.routeFork.rejectedRoutes.join(", ") || "none"],
              ["Reason tags", packet.routeFork.tags.join(", ")],
              ["Source context", packet.routeFork.sourceContext],
              ["Confidence", packet.confidenceLabel],
              ["Freshness", packet.freshnessLabel],
            ]}
          />
        </DetailSection>

        <DetailSection title="Evidence and artifacts">
          <RefList title="Sources" values={packet.sourceRefs.map((ref) => `${ref.label}; ${ref.sourceType}; ${ref.freshness}; ${ref.accessState}`)} />
          <EvidenceTrace packet={packet} />
          <ArtifactTrace packet={packet} />
        </DetailSection>

        <DetailSection title="Workers and review">
          <RefList title="Lane cards" values={packet.laneCards.map((lane) => `${lane.label}: ${lane.status}; ${lane.summary}`)} />
          <RefList title="Reviews" values={packet.reviewSummaries.map((review) => `${review.reviewer}: ${review.status}; ${review.summary}`)} />
          <RefList
            title="Worker state"
            values={[
              packet.localModelHealth ? `Local model: ${packet.localModelHealth.statusLabel}; ${packet.localModelHealth.authoritySummary}` : "Local model: none",
              packet.hermesJob ? `Hermes: ${packet.hermesJob.statusLabel}; ${packet.hermesJob.boundarySummary}` : "Hermes: none",
              packet.codexWorker ? `Codex: ${packet.codexWorker.readiness}; ${packet.codexWorker.boundarySummary}` : "Codex: none",
              packet.claudeReview ? `Claude: ${packet.claudeReview.statusLabel}; ${packet.claudeReview.boundarySummary}` : "Claude: none",
            ]}
          />
        </DetailSection>

        <DetailSection title="Gate, memory, recovery">
          <LoopStopStateList packet={packet} />
          <DeliveryEvidenceList packet={packet} />
          <LearnOutcomeList packet={packet} />
          <HumanGateActionList packet={packet} />
          <HumanGateActionRequestList packet={packet} />
          <MemoryProposalList packet={packet} />
          <RecoveryActionList packet={packet} />
        </DetailSection>
      </section>

      <section aria-label="Packet source boundaries" className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--accent)]">Source Boundary Checklist</p>
            <h2 className="mt-1 text-lg font-semibold">Canonicality and blocked operations</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">What this packet cannot do.</p>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">detail-only</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceBoundaries.map((boundary) => (
            <article className="rounded-[0.5rem] border bg-[var(--surface)] p-3" key={boundary.boundaryId}>
              <h3 className="text-sm font-semibold">{boundary.label}</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{boundary.boundarySummary}</p>
              <dl className="mt-3 grid gap-2 text-xs">
                <BoundaryField label="Boundary id" value={boundary.boundaryId} />
                <BoundaryField label="Canonicality" value={boundary.canonicality} />
                <BoundaryField label="Allowed reads" value={boundary.allowedReads.join(", ")} />
                <BoundaryField label="Allowed writes" value={boundary.allowedWrites.join(", ")} />
                <BoundaryField label="Retention class" value={boundary.retentionClass} />
                <BoundaryField label="Blocked operations" value={boundary.blockedOperations.join(", ")} />
                <BoundaryField label="Boundary summary" value={boundary.boundarySummary} />
              </dl>
            </article>
          ))}
          {packet.alphaMemorySourceStatus?.llmWikiReadiness ? (
            <article className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
              <h3 className="text-sm font-semibold">LLM-Wiki derived readiness</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {packet.alphaMemorySourceStatus.llmWikiReadiness.boundarySummary}
              </p>
              <dl className="mt-3 grid gap-2 text-xs">
                <BoundaryField label="Canonicality" value={packet.alphaMemorySourceStatus.llmWikiReadiness.canonicality} />
                <BoundaryField label="Decision" value={packet.alphaMemorySourceStatus.llmWikiReadiness.decisionState} />
                <BoundaryField label="Retention class" value={packet.alphaMemorySourceStatus.llmWikiReadiness.retentionClass} />
                <BoundaryField label="Allowed inputs" value={packet.alphaMemorySourceStatus.llmWikiReadiness.allowedInputs.join(", ") || "none"} />
                <BoundaryField label="Blocked reasons" value={packet.alphaMemorySourceStatus.llmWikiReadiness.blockedReasons.join(", ") || "none"} />
                <BoundaryField label="Durable writes" value={packet.alphaMemorySourceStatus.llmWikiReadiness.durableWriteAllowed ? "allowed" : "blocked"} />
              </dl>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function BoundaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="pipeline-neon-card rounded-[0.5rem] border bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailBlock({ body, title }: { body: string; title: string }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">{body}</p>
    </article>
  );
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function FieldList({ fields }: { fields: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 text-sm">
      {fields.map(([label, value]) => (
        <div className="rounded-[0.375rem] bg-[var(--surface)] p-2" key={label}>
          <dt className="text-xs text-[var(--muted)]">{label}</dt>
          <dd className="mt-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RefList({ empty = "None.", title, values }: { empty?: string; title: string; values: string[] }) {
  return (
    <div className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {values.length > 0 ? (
        <ul className="mt-2 grid gap-2 text-xs leading-5 text-[var(--muted)]">
          {values.map((value) => (
            <li className="break-words rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-1" key={value}>
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">{empty}</p>
      )}
    </div>
  );
}

function EvidenceTrace({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Evidence trace" empty={packet.evidenceRefs.length === 0 ? "No evidence refs for this packet." : null}>
      {packet.evidenceRefs.map((ref) => (
        <TraceBlock
          key={ref.refId}
          title={ref.label}
          fields={[
            ["Evidence type", ref.evidenceType],
            ["Ref id", ref.refId],
            ["Retention class", ref.retentionClass],
            ["Raw payload retained", String(ref.rawPayloadRetained)],
            ["Artifact path", ref.artifactPath ?? "none"],
          ]}
        />
      ))}
    </DetailCard>
  );
}

function ArtifactTrace({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Artifact trace" empty={packet.artifactRefs.length === 0 ? "No artifacts for this packet." : null}>
      {packet.artifactRefs.map((ref) => (
        <TraceBlock
          key={ref.refId}
          title={ref.label}
          fields={[
            ["Artifact type", ref.artifactType],
            ["Ref id", ref.refId],
            ["Status", ref.status],
            ["Path or URL", ref.pathOrUrl ?? "none"],
          ]}
        />
      ))}
    </DetailCard>
  );
}

function HumanGateActionList({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Human Gate actions" empty={packet.humanGateActions.length === 0 ? "No Human Gate action for this packet." : null}>
      {packet.humanGateActions.map((action) => {
        const event = packet.humanGateFixtureEvents.find((candidate) => candidate.actionId === action.actionId);
        const guards = packet.actionGuardFixtures.filter(
          (candidate) => candidate.actionSurface === "human_gate" && (candidate.actionId === action.actionId || candidate.expectedActionId === action.actionId || candidate.actualActionId === action.actionId)
        );
        return (
          <TraceBlock
            key={action.actionId}
            title={action.label}
            fields={[
              ["Typed action", action.type],
              ["Status", action.status],
              ["Family", action.family],
              ["Decision id", action.payload.decisionId],
              ["Required evidence", action.requiredEvidenceRefs.join(", ") || "none"],
              ["Disabled reason", action.disabledReason ?? "none"],
              ["Resulting state", `${action.resultingStage} / ${action.resultingOwner}`],
              ["Rollback", action.rollbackPath],
              ["Audit", action.auditEventType],
              ["Reason codes", formatReasonCodes(action.reasonCodes)],
              ["Action guard previews", guards.length > 0 ? guards.map(formatActionGuardSummary).join(" | ") : "none"],
              ["Preview event", event ? `${event.eventId}; ${event.summary}` : "none"],
              ["Stop lines", action.stopLines.join(" | ") || "none"],
            ]}
          />
        );
      })}
    </DetailCard>
  );
}

function LoopStopStateList({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Loop stop states" empty={packet.loopStopStates.length === 0 ? "No autonomous loop stop state for this packet." : null}>
      {packet.loopStopStates.map((stopState) => (
        <TraceBlock
          key={stopState.stopStateId}
          title={stopState.label}
          fields={[
            ["Kind", stopState.kind],
            ["Phase", stopState.phase],
            ["Severity", stopState.severity],
            ["Summary", stopState.summary],
            ["Stop line", stopState.stopLine],
            ["Next safe action", stopState.nextSafeAction],
            ["Evidence refs", stopState.evidenceRefs.join(", ")],
            ["Metadata", stopState.metadataOnly ? "metadata_only" : "raw_payload_risk"],
            ["Source mutation", stopState.sourceMutationAllowed ? "allowed" : "blocked"],
            ["Provider calls", stopState.providerCallsAllowed ? "allowed" : "blocked"],
            ["Worker launch", stopState.workerLaunchAllowed ? "allowed" : "blocked"],
            ["GitHub mutation", stopState.githubMutationAllowed ? "allowed" : "blocked"],
            ["Cleanup", stopState.cleanupAllowed ? "allowed" : "blocked"],
          ]}
        />
      ))}
    </DetailCard>
  );
}

function DeliveryEvidenceList({ packet }: { packet: PipelineFixturePacket }) {
  const evidence = packet.deliveryEvidence;
  return (
    <DetailCard title="Delivery and cleanup evidence" empty={evidence ? null : "No delivery or cleanup evidence for this packet."}>
      {evidence ? (
        <TraceBlock
          title={evidence.evidenceId}
          fields={[
            ["Mode", evidence.mode],
            ["Action", evidence.actionId ?? "none"],
            ["Status", evidence.status],
            ["Target branch", evidence.targetBranch ?? "none"],
            ["Base branch", evidence.baseBranch ?? "none"],
            ["Pull request", evidence.pullRequestUrl ?? "none"],
            ["Expected head", evidence.expectedHeadRevision ?? "none"],
            ["PR head", evidence.pullRequestHeadRevision ?? "none"],
            ["CI status", evidence.ciStatus ?? "none"],
            ["Review state", evidence.reviewState ?? "none"],
            ["Merge status", evidence.mergeStatus ?? "none"],
            ["Merge result", evidence.mergeResult ?? "none"],
            ["Cleanup dry-run", evidence.cleanupDryRunStatus ?? "none"],
            ["Cleanup target", evidence.cleanupTarget ?? "none"],
            ["Ready for approval", String(evidence.readyForApproval)],
            ["Delivery execution evidence", String(evidence.hasDeliveryExecutionEvidence)],
            ["Evidence refs", formatRefList(evidence.evidenceRefs)],
            ["Artifact refs", formatRefList(evidence.artifactRefs)],
            ["Retained evidence", formatRefList(evidence.retainedEvidence)],
            ["Blocked reasons", formatRefList(evidence.blockedReasons)],
            ["Recovery path", evidence.recoveryPath],
            ["Delivery rails grant authority", String(evidence.deliveryRailsGrantAuthority)],
            ["Raw payload retained", String(evidence.rawPayloadRetained)],
            ["Remote mutation approved", String(evidence.remoteMutationApproved)],
            ["Merge approved", String(evidence.mergeApproved)],
            ["Cleanup approved", String(evidence.cleanupApproved)],
          ]}
        />
      ) : null}
    </DetailCard>
  );
}

function HumanGateActionRequestList({ packet }: { packet: PipelineFixturePacket }) {
  const requests = packet.humanGateActionRequests ?? [];
  return (
    <section aria-label="Action request ledger">
      <DetailCard title="Action request ledger" empty={requests.length === 0 ? "No Human Gate action request for this packet." : null}>
        {requests.map((request) => (
          <TraceBlock
            key={request.requestId}
            title={request.requestDisplayLabel}
            fields={[
              ["Request id", request.requestId],
              ["Request status", request.status],
              ["Action id", request.actionId],
              ["Decision id", request.decisionId],
              ["Requested action type", request.requestedActionType],
              ["Request display label", request.requestDisplayLabel],
              ["Requested by", request.requestedByLabel],
              ["Requested at", request.requestedAt],
              ["Evidence refs", request.evidenceRefs.join(", ") || "none"],
              ["Retention class", request.retentionClass],
              ["Raw payload retained", String(request.rawPayloadRetained)],
              ["Execution started", String(request.executionStarted)],
              ["Resulting state applied", String(request.resultingStateApplied)],
              ["Audit", request.auditEventType],
              ["Rejection reason", request.rejectionReason ?? "none"],
              ["Rollback", request.rollbackPath],
              ["Stop lines", request.stopLines.join(" | ") || "none"],
            ]}
          />
        ))}
      </DetailCard>
    </section>
  );
}

function MemoryProposalList({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Learn panel: Memory proposals" empty={packet.memoryProposals.length === 0 ? "No memory proposal for this packet." : null}>
      {packet.memoryProposals.map((proposal) => (
        <TraceBlock
          key={proposal.proposalId}
          title={proposal.label}
          fields={[
            ["Proposal surface", "Reviewable memory proposals"],
            ["Proposal state", proposal.status],
            ["Packet id", proposal.packetId],
            ["Proposal id", proposal.proposalId],
            ["Proposal type", proposal.proposalType],
            ["Status", proposal.status],
            ["Target", proposal.targetVaultPath ?? proposal.targetVaultFolder ?? "none"],
            ["Target folder", proposal.targetVaultFolder ?? "none"],
            ["Sensitivity", proposal.sensitivity],
            ["Freshness", proposal.freshness],
            ["Contradiction", proposal.contradictionStatus],
            ["Confidence", proposal.confidence],
            ["Source refs", proposal.sourceRefs.join(", ")],
            ["Evidence refs", proposal.evidenceRefs.join(", ")],
            ["Suggested content", proposal.suggestedContentSummary],
            ["Patch summary", proposal.patchSummary ?? "summary only"],
            ["Decision context", proposal.decisionNeededContext ?? "no extra decision context"],
            ["Write-back allowed", String(proposal.writeBackAllowed)],
            ["Write-back status", proposal.writeBackStatus],
            ["Canonical Obsidian write-back", memoryProposalCanonicalGateState(proposal)],
            ["Operator action", proposal.operatorAction],
            ["Available review actions", memoryProposalReviewActions(proposal)],
            ["Reject available", memoryProposalRejectAvailable(proposal) ? "yes; review action only" : "no"],
            ["Backup / recovery", proposal.backupRecoveryPath],
          ]}
        />
      ))}
    </DetailCard>
  );
}

function LearnOutcomeList({ packet }: { packet: PipelineFixturePacket }) {
  const outcome = packet.learnOutcome;
  return (
    <DetailCard title="Learn outcome" empty={!outcome ? "No Learn outcome has been recorded for this packet." : null}>
      {outcome ? (
        <TraceBlock
          title={`${outcome.status}; ${outcome.learningProposalCount} learning proposals`}
          fields={[
            ["Outcome id", outcome.outcomeId],
            ["Retention", outcome.retentionClass],
            ["Documentation proposal", outcome.documentationProposalStatus],
            ["Automation authority", outcome.automationAuthorityChangeStatus],
            ["Blocked write-back state", outcome.blockedWriteBackState],
            ["Next safe action", outcome.nextSafeAction],
            ["Source refs", outcome.sourceRefs.join(", ") || "none"],
            ["Evidence refs", outcome.evidenceRefs.join(", ") || "none"],
            ["Canonical mutation", outcome.canonicalMutationAllowed ? "allowed" : "blocked"],
            ["Source mutation", outcome.sourceMutationAllowed ? "allowed" : "blocked"],
            ["Provider calls", outcome.providerCallsAllowed ? "allowed" : "blocked"],
            ["Durable writes", outcome.durableWriteAllowed ? "allowed" : "blocked"],
            [
              "Decision records",
              outcome.decisionRecords.map((decision) => `${decision.actor}: ${decision.proposalId} -> ${decision.result}; ${decision.recoveryPath}`).join(" | ") || "none",
            ],
          ]}
        />
      ) : null}
    </DetailCard>
  );
}

function memoryProposalReviewActions(proposal: PipelineFixturePacket["memoryProposals"][number]) {
  const actions = ["defer"];
  if (memoryProposalRejectAvailable(proposal)) {
    actions.push("reject");
  }
  if (!["blocked", "stale", "contradictory", "rejected"].includes(proposal.status) && proposal.freshness === "fresh" && proposal.contradictionStatus === "none") {
    actions.push("approve future draft");
  }
  if (proposal.status !== "rejected") {
    actions.push("request edit");
  }
  return actions.join(", ");
}

function memoryProposalRejectAvailable(proposal: PipelineFixturePacket["memoryProposals"][number]) {
  return proposal.status !== "rejected";
}

function memoryProposalCanonicalGateState(proposal: PipelineFixturePacket["memoryProposals"][number]) {
  return proposal.writeBackAllowed === false
    ? "blocked; writeBackAllowed=false"
    : "blocked; invalid proposal writeBackAllowed state requires separate gated review";
}

function RecoveryActionList({ packet }: { packet: PipelineFixturePacket }) {
  return (
    <DetailCard title="Recovery actions" empty={packet.recoveryActions.length === 0 ? "No recovery action for this packet." : null}>
      {packet.recoveryActions.map((action) => {
        const guard = packet.actionGuardFixtures.find(
          (candidate) => candidate.actionSurface === "recovery" && (candidate.actionId === action.actionId || candidate.expectedActionId === action.actionId || candidate.actualActionId === action.actionId)
        );
        const event = packet.recoveryFixtureEvents.find((candidate) => candidate.actionId === action.actionId);
        return (
          <TraceBlock
            key={action.actionId}
            title={action.label}
            fields={[
              ["Action type", action.actionType],
              ["Availability", action.availability],
              ["Consequence", action.consequence],
              ["Resulting state", `${action.resultingStage} / ${action.resultingOwner}`],
              ["Evidence refs", action.evidenceRefs.join(", ") || "none"],
              ["Action guard preview", guard ? `${guard.classification}; ${guard.primaryRisk}; ${guard.safeNextOption}` : "none"],
              ["Expected binding", guard ? `${guard.expectedPacketId} / ${guard.expectedActionId} / ${guard.expectedState}` : "none"],
              ["Actual binding", guard ? `${guard.actualPacketId} / ${guard.actualActionId} / ${guard.actualState}` : "none"],
              ["Primary risk", guard?.primaryRisk ?? "none"],
              ["Stop line", guard?.stopLine ?? "none"],
              ["Safe next option", guard?.safeNextOption ?? "none"],
              ["Recovery preview event", event ? `${event.eventId}; ${event.summary}` : "none"],
              ["Human Gate binding", event?.humanGateActionId ?? "none"],
            ]}
          />
        );
      })}
    </DetailCard>
  );
}

function formatActionGuardSummary(guard: PipelineFixturePacket["actionGuardFixtures"][number]) {
  return `${guard.classification}; ${guard.primaryRisk}; ${guard.safeNextOption}`;
}

function formatRefList(values?: readonly string[] | null) {
  return values?.join(", ") || "none";
}

function formatReasonCodes(reasonCodes: unknown) {
  return Array.isArray(reasonCodes) && reasonCodes.every((code) => typeof code === "string") && reasonCodes.length > 0 ? reasonCodes.join(", ") : "none";
}

function DetailCard({ children, empty, title }: { children: ReactNode; empty: string | null; title: string }) {
  return (
    <div className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {empty ? <p className="mt-2 text-xs text-[var(--muted)]">{empty}</p> : <div className="mt-2 grid gap-2">{children}</div>}
    </div>
  );
}

function TraceBlock({ fields, title }: { fields: Array<[string, string]>; title: string }) {
  return (
    <article className="rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-2">
      <h4 className="break-words text-xs font-semibold">{title}</h4>
      <dl className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
        {fields.map(([label, value]) => (
          <div className="grid gap-1 md:grid-cols-[9rem_minmax(0,1fr)]" key={label}>
            <dt>{label}</dt>
            <dd className="break-words text-[var(--foreground)]">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
