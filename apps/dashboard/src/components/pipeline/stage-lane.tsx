import type { PipelineFixturePacket } from "../../lib/pipeline-fixtures";
import { WorkPacketCard } from "./work-packet-card";

export function StageLane({
  name,
  onMovePacketFocus,
  onReturnFocus,
  packets,
  registerPacketCard,
  selectedPacketId,
  onSelectPacket,
}: {
  name: string;
  onMovePacketFocus: (packetId: string, direction: "previous" | "next") => void;
  onReturnFocus: () => void;
  packets: PipelineFixturePacket[];
  registerPacketCard: (packetId: string, node: HTMLElement | null) => void;
  selectedPacketId: string;
  onSelectPacket: (packetId: string) => void;
}) {
  return (
    <section className="flex min-h-[24rem] w-[15rem] max-w-[82vw] shrink-0 snap-start flex-col rounded-[0.5rem] border bg-[var(--surface)] p-3" aria-label={`${name} stage lane`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{formatStageName(name)}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Health: {laneSummary(name, packets)}</p>
        </div>
        <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 font-mono text-xs">{packets.length}</span>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-3">
        {packets.length === 0 ? (
          <p className="rounded-[0.5rem] border border-dashed bg-[var(--background-elevated)] p-3 text-xs text-[var(--muted)]">
            No fixture packets in this lane.
          </p>
        ) : (
          packets.map((packet) => (
            <WorkPacketCard
              key={packet.packetId}
              packet={packet}
              selected={packet.packetId === selectedPacketId}
              onEscape={onReturnFocus}
              onMoveFocus={onMovePacketFocus}
              onSelect={onSelectPacket}
              registerCard={registerPacketCard}
            />
          ))
        )}
      </div>
    </section>
  );
}

function formatStageName(name: string) {
  return name.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function laneSummary(name: string, packets: PipelineFixturePacket[]) {
  if (packets.length === 0) {
    return "empty fixture lane";
  }

  const statusSummary = summarizeStatuses(packets);

  if (packets.some((packet) => packet.status === "blocked")) {
    return `${statusSummary}; recovery path visible.`;
  }
  if (name === "human_gate") {
    return `${statusSummary}; operator decision queued.`;
  }
  if (name === "execute") {
    return `${statusSummary}; worker containment visible.`;
  }
  if (name === "learn") {
    return `${statusSummary}; memory proposal review.`;
  }
  return `${statusSummary}; ${formatStageName(name)} evidence visible.`;
}

function summarizeStatuses(packets: PipelineFixturePacket[]) {
  const counts = new Map<PipelineFixturePacket["status"], number>();
  for (const packet of packets) {
    counts.set(packet.status, (counts.get(packet.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
}
