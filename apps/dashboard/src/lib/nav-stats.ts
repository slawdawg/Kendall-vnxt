import type { WorkItemView } from "@kendall/contracts";

export type NavStats = {
  queue: number;
  active: number;
  audit: number;
  attention: number;
};

export function buildNavStats(items: WorkItemView[]): NavStats {
  return {
    queue: items.filter((item) => ["queued", "triaged", "ready"].includes(item.state)).length,
    active: items.filter((item) => ["implementing", "validating", "reviewing", "awaiting_audit"].includes(item.state)).length,
    audit: items.filter((item) => item.state === "awaiting_audit").length,
    attention: items.filter((item) => item.needsAttention).length,
  };
}
