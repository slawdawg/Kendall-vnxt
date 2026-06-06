import type { WorkItemFilterView, WorkItemView } from "@kendall/contracts";

export type WorkItemFilterState = WorkItemFilterView;

export const defaultWorkItemFilters: WorkItemFilterState = {
  query: "",
  risk: "all",
  audit: "all",
  source: "all",
  origin: "all",
  issues: "all",
};

export type WorkItemFilterPreset = {
  label: string;
  filters: Partial<WorkItemFilterState>;
};

export const sharedFilterPresets: WorkItemFilterPreset[] = [
  { label: "All work", filters: defaultWorkItemFilters },
  { label: "High risk", filters: { risk: "high" } },
  { label: "Needs audit", filters: { audit: "required" } },
  { label: "Review lane", filters: { audit: "required", risk: "high" } },
  { label: "Self-detected issues", filters: { origin: "supervisor", issues: "self-detected" } },
];

export function getSourceOptions(items: WorkItemView[]): string[] {
  return [...new Set(items.map((item) => item.source).filter(Boolean))].sort();
}

export function filterWorkItems(items: WorkItemView[], filters: WorkItemFilterState): WorkItemView[] {
  const query = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.risk !== "all" && item.riskLevel !== filters.risk) {
      return false;
    }

    if (filters.audit !== "all" && item.auditMode !== filters.audit) {
      return false;
    }

    if (filters.source !== "all" && item.source !== filters.source) {
      return false;
    }

    if (filters.origin !== "all" && item.origin !== filters.origin) {
      return false;
    }

    if (filters.issues === "self-detected" && !item.selfDetectedIssue) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      item.title,
      item.requestedOutcome,
      item.statusSummary,
      item.details ?? "",
      item.source,
      item.origin,
      item.state,
      item.auditMode,
      item.riskLevel,
      item.selfDetectedIssueCategory ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function filtersFromSearchParams(searchParams: URLSearchParams): WorkItemFilterState {
  const query = searchParams.get("q") ?? "";
  const risk = searchParams.get("risk");
  const audit = searchParams.get("audit");
  const source = searchParams.get("source") ?? "all";
  const origin = searchParams.get("origin");
  const issues = searchParams.get("issues");

  return {
    query,
    risk: risk === "low" || risk === "medium" || risk === "high" ? risk : "all",
    audit: audit === "none" || audit === "advisory" || audit === "required" ? audit : "all",
    source,
    origin: origin === "operator" || origin === "supervisor" ? origin : "all",
    issues: issues === "self-detected" ? issues : "all",
  };
}

export function filtersToSearchParams(filters: WorkItemFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query.trim()) {
    params.set("q", filters.query.trim());
  }
  if (filters.risk !== "all") {
    params.set("risk", filters.risk);
  }
  if (filters.audit !== "all") {
    params.set("audit", filters.audit);
  }
  if (filters.source !== "all") {
    params.set("source", filters.source);
  }
  if (filters.origin !== "all") {
    params.set("origin", filters.origin);
  }
  if (filters.issues !== "all") {
    params.set("issues", filters.issues);
  }

  return params;
}

export function mergeFilterState(
  current: WorkItemFilterState,
  next: Partial<WorkItemFilterState>,
): WorkItemFilterState {
  return {
    ...current,
    ...next,
  };
}

export function areFiltersEqual(left: WorkItemFilterState, right: WorkItemFilterState): boolean {
  return (
    left.query === right.query &&
    left.risk === right.risk &&
    left.audit === right.audit &&
    left.source === right.source &&
    left.origin === right.origin &&
    left.issues === right.issues
  );
}
