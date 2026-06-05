"use client";

import type { SavedWorkItemView, WorkItemView } from "@kendall/contracts";

import { WorkGrid } from "./work-grid";
import { UrlSyncedWorkItemFilters } from "./url-synced-work-item-browser";

export function QueueBrowser({ items, savedViews }: { items: WorkItemView[]; savedViews: SavedWorkItemView[] }) {
  const browser = UrlSyncedWorkItemFilters({
    items,
    label: "Filter queue and lane backlog",
    scope: "queue",
    initialSavedViews: savedViews,
  });

  return (
    <>
      {browser.controls}
      <WorkGrid items={browser.filtered} />
    </>
  );
}
