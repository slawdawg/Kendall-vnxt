"use client";

import { useEffect, useState } from "react";

import { getSupervisorBaseUrl } from "../lib/supervisor";

type FeedLine = {
  id: string;
  text: string;
};

export function LiveFeed() {
  const [lines, setLines] = useState<FeedLine[]>([
    { id: "waiting", text: "Waiting for supervisor events..." },
  ]);

  useEffect(() => {
    const source = new EventSource(`${getSupervisorBaseUrl()}/events`);
    source.onmessage = (event) => {
      setLines((current) => [{ id: crypto.randomUUID(), text: event.data }, ...current].slice(0, 8));
    };
    source.onerror = () => {
      setLines((current) => [
        {
          id: crypto.randomUUID(),
          text: "Event stream disconnected. Refresh to resync with authoritative state.",
        },
        ...current,
      ].slice(0, 8));
      source.close();
    };
    return () => source.close();
  }, []);

  return (
    <section className="rounded-[1.75rem] border bg-[#17211f] p-6 text-[#e8f2ed] shadow-sm">
      <p className="font-mono text-xs uppercase tracking-[0.32em] text-[#8fd6bc]">Live feed</p>
      <div className="mt-4 space-y-3 font-mono text-xs leading-5">
        {lines.map((line) => (
          <pre key={line.id} className="overflow-x-auto whitespace-pre-wrap break-words">
            {line.text}
          </pre>
        ))}
      </div>
    </section>
  );
}
