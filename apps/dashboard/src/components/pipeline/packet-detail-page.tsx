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
          <RefList title="Evidence" values={packet.evidenceRefs.map((ref) => `${ref.label}; ${ref.evidenceType}; retained ${String(ref.rawPayloadRetained)}`)} />
          <RefList title="Artifacts" values={packet.artifactRefs.map((ref) => `${ref.label}; ${ref.artifactType}; ${ref.status}`)} />
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
          <RefList title="Human Gate actions" values={packet.humanGateActions.map((action) => `${action.label}: ${action.status}; ${action.disabledReason ?? action.resultingStage}`)} />
          <RefList title="Memory proposals" values={packet.memoryProposals.map((proposal) => `${proposal.label}: ${proposal.status}; ${proposal.targetVaultPath ?? proposal.targetVaultFolder}`)} empty="No memory proposal for this packet." />
          <RefList title="Recovery actions" values={packet.recoveryActions.map((action) => `${action.label}: ${action.availability}; ${action.resultingStage}`)} empty="No recovery action for this packet." />
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
