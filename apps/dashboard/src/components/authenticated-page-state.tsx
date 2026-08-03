"use client";

import { Shell } from "./shell";

export function AuthenticatedPageState({
  title,
  state,
  onRetry,
  diagnostic,
}: {
  title: string;
  state: "loading" | "empty" | "expired" | "not_found" | "unavailable";
  onRetry?: () => void;
  diagnostic?: string | null;
}) {
  const copy = {
    loading: ["Loading dashboard data", `Reading authenticated supervisor data for ${title}.`],
    empty: ["No records yet", `${title} has no current supervisor records.`],
    expired: ["Session expired", "Your authenticated dashboard session ended. Sign in again to continue."],
    not_found: ["Record not found", `${title} is not available from the supervisor.`],
    unavailable: ["Dashboard data unavailable", `The authenticated supervisor read for ${title} could not be completed.`],
  } as const;
  const [heading, body] = copy[state];
  return (
    <Shell lanAuthEnabled realtimeRefresh={false}>
      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-6 shadow-sm" role={state === "loading" ? "status" : "alert"} aria-live="polite">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
        {state === "unavailable" && diagnostic ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{diagnostic}</p> : null}
        {state === "expired" ? <a className="mt-4 inline-block rounded-[0.375rem] border px-3 py-2 text-xs font-medium" href="/">Return to sign in</a> : null}
        {state === "unavailable" && onRetry ? <button type="button" className="mt-4 rounded-[0.375rem] border px-3 py-2 text-xs font-medium" onClick={onRetry}>Retry read</button> : null}
      </section>
    </Shell>
  );
}
