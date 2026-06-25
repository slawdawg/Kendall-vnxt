import type { KeyboardEvent } from "react";
import type { PipelineFixturePacket } from "../../lib/pipeline-fixtures";

export function WorkPacketCard({
  onEscape,
  onMoveFocus,
  packet,
  registerCard,
  selected,
  onSelect,
}: {
  onEscape: () => void;
  onMoveFocus: (packetId: string, direction: "previous" | "next") => void;
  packet: PipelineFixturePacket;
  registerCard: (packetId: string, node: HTMLElement | null) => void;
  selected: boolean;
  onSelect: (packetId: string) => void;
}) {
  const cardContextId = `packet-card-${packet.packetId.replace(/[^a-zA-Z0-9_-]/g, "-")}-context`;
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(packet.packetId);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      onMoveFocus(packet.packetId, "previous");
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      onMoveFocus(packet.packetId, "next");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  };

  return (
    <article
      aria-describedby={cardContextId}
      aria-label={`Select packet: ${packet.title}`}
      aria-pressed={selected}
      className={`min-w-0 cursor-pointer overflow-hidden rounded-[0.5rem] border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] ${selected ? "border-[var(--accent)] bg-[var(--panel-strong)]" : "bg-[var(--panel)] max-sm:hidden"}`}
      onClick={() => onSelect(packet.packetId)}
      onKeyDown={handleKeyDown}
      ref={(node) => registerCard(packet.packetId, node)}
      role="button"
      tabIndex={selected ? 0 : -1}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--accent)]" style={{ overflowWrap: "anywhere" }}>
            {packet.fixtureLabel}
          </p>
          <h3 className="mt-1 break-words text-sm font-semibold leading-5">{packet.title}</h3>
        </div>
        <span className="max-w-[5.75rem] shrink-0 break-words rounded-full bg-[var(--background-elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
          Risk: {packet.riskLevel}
        </span>
      </div>
      <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">{packet.summary}</p>
      <p className="mt-2 break-words text-xs text-[var(--muted)]">
        Source: {packet.sourceRefs[0]?.label ?? "Fixture source unavailable"}
      </p>
      <p className="mt-1 break-words text-xs text-[var(--muted)]">
        Source trust: {packet.sourceTrustStates.join(", ")}
      </p>
      <p className="mt-2 break-words text-xs text-[var(--muted)]">{packet.laneCards[0]?.label ?? "Fixture lane"}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-[var(--muted)]">Owner</dt>
          <dd className="break-words" style={{ overflowWrap: "anywhere" }}>{packet.currentOwner}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Confidence</dt>
          <dd className="break-words" style={{ overflowWrap: "anywhere" }}>{packet.confidenceLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Evidence</dt>
          <dd className="break-words" style={{ overflowWrap: "anywhere" }}>{packet.evidenceRefs.length}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Freshness</dt>
          <dd className="break-words" style={{ overflowWrap: "anywhere" }}>{packet.freshnessLabel}</dd>
        </div>
      </dl>
      <p className="mt-3 break-words rounded-[0.375rem] bg-[var(--background-elevated)] px-2 py-1 text-xs">
        Next: {packet.nextAction}
      </p>
      <span className="sr-only" id={cardContextId}>
        {packet.currentStage} stage, {packet.currentOwner} owner, {packet.status} status, {packet.priority} priority, {packet.riskLevel} risk, {packet.confidenceLabel}, {packet.freshnessLabel}, source trust {packet.sourceTrustStates.join(", ")}, next action {packet.nextAction}.
      </span>
    </article>
  );
}
