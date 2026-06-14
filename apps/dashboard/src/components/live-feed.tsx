"use client";

import { useEffect, useState } from "react";
import type { SupervisorEvent } from "@kendall/contracts";

import { getSupervisorBaseUrl } from "../lib/supervisor";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

type FeedLine = {
  id: string;
  text: string;
  tone?: "default" | "warn" | "accent";
};

function titleize(value: string): string {
  return value.replaceAll(".", " ");
}

function formatFeedLine(event: SupervisorEvent): FeedLine {
  const summary =
    typeof event.payload.summary === "string" && event.payload.summary
      ? event.payload.summary
      : titleize(event.eventType);
  const state = typeof event.payload.state === "string" ? event.payload.state : null;
  const lane = typeof event.payload.lane === "string" ? event.payload.lane : null;
  const assignee = typeof event.payload.assigneeLabel === "string"
    ? event.payload.assigneeLabel
    : typeof event.payload.assigneeId === "string"
      ? event.payload.assigneeId
      : null;
  const actorName = event.actorLabel ?? (event.actorType === "operator" ? "operator" : "system");
  const note = typeof event.payload.note === "string" && event.payload.note ? ` Note: ${event.payload.note}` : "";
  const workItem = event.workItemId ? ` [${event.workItemId.slice(0, 8)}]` : "";
  const statePart = state ? ` -> ${formatWorkflowState(state)}` : "";
  const lanePart = lane ? ` (${formatLane(lane)})` : "";
  const ownerPart = assignee ? ` [owner: ${assignee}]` : "";
  const tone = event.eventType.includes("blocked") ? "warn" : event.actorType === "operator" ? "accent" : "default";

  return {
    id: event.eventId,
    tone,
    text: `${actorName}${workItem}: ${summary}${statePart}${lanePart}${ownerPart}${note}`,
  };
}

export function LiveFeed() {
  const [lines, setLines] = useState<FeedLine[]>([
    { id: "waiting", text: "Waiting for supervisor events..." },
  ]);

  useEffect(() => {
    const source = new EventSource(`${getSupervisorBaseUrl()}/events`);
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SupervisorEvent;
        setLines((current) => [formatFeedLine(parsed), ...current].slice(0, 8));
      } catch {
        setLines((current) => [{ id: crypto.randomUUID(), text: event.data }, ...current].slice(0, 8));
      }
    };
    source.onerror = () => {
      setLines((current) => [
        {
          id: crypto.randomUUID(),
          text: "Event stream disconnected. Reconnecting...",
        },
        ...current,
      ].slice(0, 8));
    };
    return () => source.close();
  }, []);

  return (
    <section className="rounded-[1.75rem] border bg-[var(--surface)] p-6 text-[var(--foreground)] shadow-sm">
      <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Live activity</p>
      <div className="mt-4 space-y-3 font-mono text-xs leading-5">
        {lines.map((line) => (
          <pre
            key={line.id}
            className={`overflow-x-auto whitespace-pre-wrap break-words ${
              line.tone === "warn"
                ? "text-[var(--warn)]"
                : line.tone === "accent"
                  ? "text-[var(--accent)]"
                  : "text-[var(--foreground)]"
            }`}
          >
            {line.text}
          </pre>
        ))}
      </div>
    </section>
  );
}
