"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupervisorBaseUrl } from "../lib/supervisor";

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
