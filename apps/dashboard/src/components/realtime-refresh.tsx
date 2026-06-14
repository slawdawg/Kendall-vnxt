"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupervisorBaseUrl } from "../lib/supervisor";

const refreshPauseStorageKey = "kendall-dashboard-realtime-refresh-paused-until";

function getRefreshPauseRemainingMs() {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(refreshPauseStorageKey);
  } catch {
    return 0;
  }
  if (!raw) {
    return 0;
  }
  const pausedUntil = Number(raw);
  if (!Number.isFinite(pausedUntil) || Date.now() >= pausedUntil) {
    try {
      window.localStorage.removeItem(refreshPauseStorageKey);
    } catch {
      return 0;
    }
    return 0;
  }
  return pausedUntil - Date.now();
}

export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource(`${getSupervisorBaseUrl()}/events`);

    source.onmessage = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        const remainingPauseMs = getRefreshPauseRemainingMs();
        if (remainingPauseMs > 0) {
          refreshTimer = setTimeout(() => {
            router.refresh();
            refreshTimer = null;
          }, remainingPauseMs + 25);
          return;
        }
        if (refreshTimer) {
          refreshTimer = null;
        }
        router.refresh();
        refreshTimer = null;
      }, 250);
    };

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      source.close();
    };
  }, [router]);

  return null;
}
