"use client";

import { useEffect, useState } from "react";

export type DashboardSessionRole = "operator" | "test_viewer" | "unknown";

export function useDashboardSessionRole(): DashboardSessionRole {
  const [role, setRole] = useState<DashboardSessionRole>("unknown");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    void fetch("/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { authenticated?: boolean; role?: string } | null;
        setRole(response.ok && payload?.authenticated === true && (payload.role === "operator" || payload.role === "test_viewer") ? payload.role : "operator");
      })
      .catch(() => setRole("operator"))
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  return role;
}
