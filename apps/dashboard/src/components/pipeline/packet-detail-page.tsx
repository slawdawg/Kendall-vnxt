import type { ReactNode } from "react";
import Link from "next/link";
import { LocalDogfoodAttestationPanel } from "./local-dogfood-attestation-panel";
import type { PipelineRuntimeSourceState } from "../../lib/pipeline-packet-loader";
import type { DashboardCanonicalWorkPacketV1 } from "../../lib/pipeline-supervisor-runtime";
import type { DashboardCanonicalWorkGraphEvidenceV1 } from "../../lib/pipeline/canonical-operational-projection";

/**
 * Normal direct-detail renderer. It consumes the dashboard-owned canonical
 * presentation and never materializes the legacy packet model. Demo fixtures
 * keep their isolated compatibility renderer in packet-detail-fixture-page.tsx.
 */
export function PacketDetailPage({
  canonicalPacket,
  sourceState,
  workGraph = null,
}: {
  canonicalPacket: DashboardCanonicalWorkPacketV1;
  sourceState?: PipelineRuntimeSourceState;
  workGraph?: DashboardCanonicalWorkGraphEvidenceV1 | null;
}) {
  const { authoritativeLifecycle: lifecycle, presentation } = canonicalPacket;
  const backHref = sourceState?.kind === "demo" ? "/pipeline/demo" : "/pipeline";
  const latestEvent = presentation.transitionEvents.at(-1) ?? null;
  const sourceRefs = presentation.sourceRefs;
  const evidenceRefs = presentation.evidenceRefs;
  const lifecycleSummary = latestEvent?.summary ?? "The supervisor has not recorded a lifecycle transition summary for this packet.";
  const nextSafeAction = lifecycle.readyToTest?.userFacingSummary
    ?? "Review the authoritative lifecycle and its retained event evidence before taking an operator action.";

  return (
    <main className="grid max-w-full min-w-0 gap-4" aria-label="Packet detail">
      <section className="pipeline-nohype-shell rounded-[0.5rem] border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="rounded-[0.375rem] border bg-[var(--surface)] px-2 py-1 text-xs text-[var(--accent)]" href={backHref}>
            Back to pipeline
          </Link>
          <Badge>{presentation.currentStage}</Badge>
          <Badge>{presentation.currentOwner}</Badge>
          <Badge>Source: Supervisor runtime</Badge>
          {sourceState ? <Badge>{sourceState.label}</Badge> : null}
          <Badge>canonical presentation v1</Badge>
        </div>
        <h1 className="mt-3 break-words text-2xl font-semibold">Packet detail: {presentation.title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{lifecycleSummary}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Stage" value={presentation.currentStage} />
          <SummaryTile label="Status" value={presentation.status} />
          <SummaryTile label="Risk" value={presentation.riskLevel} />
          <SummaryTile label="Priority" value={presentation.priority} />
        </div>
      </section>

      <section aria-label="Packet 5 Whys" className="grid gap-3 rounded-[0.5rem] border bg-[var(--panel)] p-4 md:grid-cols-2 xl:grid-cols-5">
        <DetailBlock title="What is this?" body={presentation.requestedOutcome} />
        <DetailBlock title="Why is it here?" body={lifecycleSummary} />
        <DetailBlock title="Where is it?" body={`${presentation.currentStage} stage; ${presentation.currentOwner} owns the current lifecycle state.`} />
        <DetailBlock title="What proof exists?" body={`${evidenceRefs.length} retained event evidence refs and ${sourceRefs.length} canonical source refs.`} />
        <DetailBlock title="What happens next?" body={nextSafeAction} />
      </section>

      <LocalDogfoodAttestationPanel enabled targetRef={lifecycle.packetId} />

      {workGraph ? <PacketDetailWorkGraph workGraph={workGraph} /> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="Authoritative lifecycle">
          <FieldList
            fields={[
              ["Packet", lifecycle.packetId],
              ["Current event", lifecycle.currentEventId],
              ["Truth", lifecycle.truthLabel],
              ["Created", lifecycle.createdAt],
              ["Updated", lifecycle.updatedAt],
              ["Parent packet", lifecycle.parentPacketId ?? "none"],
              ["Lineage", lifecycle.lineageKind ?? "none"],
              ["Metadata only", String(lifecycle.metadataOnly)],
            ]}
          />
        </DetailSection>

        <DetailSection title="Sources and retained evidence">
          <RefList
            title="Canonical sources"
            values={sourceRefs.map((source) => `${source.refId}; ${source.label}; ${source.sourceType}; ${source.freshness}; ${source.accessState}`)}
            empty="No canonical source references are available."
          />
          <RefList
            title="Lifecycle evidence"
            values={evidenceRefs.map((evidence) => `${evidence.refId}; ${evidence.label}; ${evidence.evidenceType}; retained ${evidence.retentionClass}`)}
            empty="No lifecycle evidence references are available."
          />
        </DetailSection>
      </section>

      <DetailSection title="Lifecycle history">
        {presentation.transitionEvents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No metadata-only lifecycle transitions are available.</p>
        ) : (
          <div className="grid gap-3">
            {presentation.transitionEvents.map((event) => (
              <article className="rounded-[0.5rem] border bg-[var(--surface)] p-3" key={event.eventId}>
                <h3 className="break-words text-sm font-semibold">{event.eventType}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{event.summary}</p>
                <FieldList
                  fields={[
                    ["Occurred", event.createdAt],
                    ["Target stage", event.targetStage],
                    ["Target owner", event.targetOwner],
                    ["Status", event.targetStatus],
                    ["Actor", event.actorLabel],
                    ["Reasons", event.reasonCodes.join(", ") || "none"],
                    ["Evidence", event.evidenceRefs.join(", ") || "none"],
                  ]}
                />
              </article>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Canonical boundary">
        <FieldList
          fields={[
            ["Presentation", presentation.schemaVersion],
            ["Lifecycle source", presentation.lifecycleState.source],
            ["Raw payload retained", "false"],
            ["Provider calls", "blocked"],
            ["Worker launch", "blocked"],
            ["GitHub mutation", "blocked"],
            ["Cleanup", "blocked"],
          ]}
        />
      </DetailSection>
    </main>
  );
}

function PacketDetailWorkGraph({ workGraph }: { workGraph: DashboardCanonicalWorkGraphEvidenceV1 }) {
  const attention = workGraph.availability !== "available" || workGraph.waveMembership === "blocked" || workGraph.waveMembership === "deferred";
  return (
    <DetailSection title="Work Graph">
      {attention ? <p aria-live="assertive" className="text-sm leading-6 text-[var(--muted)]">Work Graph is {workGraph.availability === "available" ? workGraph.waveMembership : workGraph.availability}. {workGraph.nextSafeAction}</p> : null}
      <FieldList
        fields={[
          ["Wave", workGraph.waveMembership],
          ["Dependencies", workGraph.dependencyState],
          ["Reservation", `${workGraph.reservation.status}; ${workGraph.reservation.reasonCode}; owner ${workGraph.reservation.owner ?? "not assigned"}`],
          ["Capacity", `${workGraph.capacity.posture}; ${workGraph.capacity.reasonCode}`],
          ["Reason", workGraph.reason],
          ["Recovery", workGraph.nextSafeAction],
          ["Freshness", workGraph.generatedAt ? `${workGraph.freshnessState}; generated ${workGraph.generatedAt}` : workGraph.freshnessState],
          ["Boundary", "Advisory metadata only; no dispatch, provider execution, findings, or delivery eligibility."],
        ]}
      />
      <RefList title="Work Graph evidence" values={workGraph.evidenceRefs} empty="No Work Graph evidence is available." />
    </DetailSection>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{children}</span>;
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
          {values.map((value) => <li className="break-words rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-1" key={value}>{value}</li>)}
        </ul>
      ) : <p className="mt-2 text-xs text-[var(--muted)]">{empty}</p>}
    </div>
  );
}
