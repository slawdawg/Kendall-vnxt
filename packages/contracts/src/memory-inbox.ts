/**
 * Story 1.1's deliberately content-free Memory Inbox shell contract.
 * Lifecycle projection, inventory, and item data belong to later versions.
 */
export type MemoryInboxDestinationV1 = "inbox" | "drafts" | "review" | "processed";
export type MemoryInboxShellStateV1 = "unavailable";
export type MemoryInboxShellFreshnessV1 = "current" | "stale" | "unavailable";
export type MemoryInboxShellNextSafeActionV1 = "refresh_memory_inbox";

export interface MemoryInboxShellStatusV1 {
  schemaVersion: "kendall-memory-inbox-shell/v1";
  state: MemoryInboxShellStateV1;
  freshness: MemoryInboxShellFreshnessV1;
  nextSafeAction: MemoryInboxShellNextSafeActionV1;
}

export function isMemoryInboxShellStatusV1(value: unknown): value is MemoryInboxShellStatusV1 {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  return status.schemaVersion === "kendall-memory-inbox-shell/v1"
    && status.state === "unavailable"
    && status.freshness === "current"
    && status.nextSafeAction === "refresh_memory_inbox"
    && Object.keys(status).every((key) => ["schemaVersion", "state", "freshness", "nextSafeAction"].includes(key));
}
