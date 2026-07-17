"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "../shell";

type PacketDetail = {
  packetId: string;
  title: string;
  currentStage: string;
  status: string;
  truthLabel: string;
  evidence: {
    evidenceClass?: string;
    checkedAt?: string;
    expiresAt?: string;
    freshnessState?: string;
    effectiveDecision?: string;
    typedBlockers?: string[];
  } | null;
};

export function LanPacketDetailPage({ packetId }: { packetId: string }) {
  const [packet, setPacket] = useState<PacketDetail | null>(null);
  const [state, setState] = useState<"loading" | "unavailable" | "expired">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/packet-detail/${encodeURIComponent(packetId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { state?: string; packet?: PacketDetail } | null;
        if (response.status === 401 || payload?.state === "sign_in_required") {
          setState("expired");
          return;
        }
        if (!response.ok || payload?.state !== "available" || !payload.packet || payload.packet.packetId !== packetId) {
          setState("unavailable");
          return;
        }
        setPacket(payload.packet);
        setState("loading");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("unavailable");
      });
    return () => controller.abort();
  }, [packetId]);

  if (state === "expired") {
    return <Shell compactHeader realtimeRefresh={false} wide><Message title="Session expired" body="Your authenticated Packet Detail session ended. Return to the dashboard to sign in again." action="Return to sign in" /></Shell>;
  }
  if (state === "unavailable") {
    return <Shell compactHeader realtimeRefresh={false} wide><Message title="Packet detail unavailable" body="The authenticated Packet Detail read could not be completed." action="Back to pipeline" /></Shell>;
  }
  if (!packet) {
    return <Shell compactHeader realtimeRefresh={false} wide><Message title="Loading packet detail" body="Reading the authenticated Packet Detail mediator." action="" /></Shell>;
  }

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <main className="grid max-w-full min-w-0 gap-4" aria-label="Authenticated packet detail">
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
          <Link className="rounded-[0.375rem] border bg-[var(--surface)] px-2 py-1 text-xs text-[var(--accent)]" href="/pipeline">Back to pipeline</Link>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--accent)]">Authenticated Packet Detail</p>
          <h1 className="mt-2 break-words text-2xl font-semibold">{packet.title}</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Packet" value={packet.packetId} />
            <DetailField label="Stage" value={packet.currentStage} />
            <DetailField label="Status" value={packet.status} />
            <DetailField label="Truth" value={packet.truthLabel} />
          </div>
        </section>
        <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4" aria-label="Packet evidence">
          <h2 className="text-lg font-semibold">Evidence readback</h2>
          {packet.evidence ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DetailField label="Freshness" value={packet.evidence.freshnessState ?? "Unavailable"} />
              <DetailField label="Decision" value={packet.evidence.effectiveDecision ?? "Unavailable"} />
              <DetailField label="Checked" value={packet.evidence.checkedAt ?? "Unavailable"} />
              <DetailField label="Expires" value={packet.evidence.expiresAt ?? "Unavailable"} />
              <DetailField label="Evidence class" value={packet.evidence.evidenceClass ?? "Unavailable"} />
              <DetailField label="Blockers" value={packet.evidence.typedBlockers?.join(", ") || "None"} />
            </div>
          ) : <p className="mt-2 text-sm text-[var(--muted)]">No evidence readback is available.</p>}
        </section>
      </main>
    </Shell>
  );
}

function Message({ title, body, action }: { title: string; body: string; action: string }) {
  return <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role={title === "Loading packet detail" ? "status" : "alert"}><h1 className="text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>{action ? <Link className="mt-4 inline-block rounded-[0.375rem] border px-3 py-2 text-xs font-medium" href={action === "Return to sign in" ? "/" : "/pipeline"}>{action}</Link> : null}</section>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[0.375rem] border bg-[var(--surface)] p-3"><p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>;
}
