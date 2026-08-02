import Link from "next/link";

export default function PipelineDemoNotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-4 px-6 py-12" aria-labelledby="demo-unavailable-title">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">404 · Fixture route unavailable</p>
      <h1 id="demo-unavailable-title" className="text-3xl font-semibold">Demo packets are not available in the LAN cockpit.</h1>
      <p className="text-[var(--muted)]">
        This dashboard only renders supervisor-backed packet data. Fixture routes are enabled only in an explicit local development or test server.
      </p>
      <Link className="w-fit rounded-[0.375rem] border bg-[var(--panel)] px-3 py-2 text-sm font-semibold" href="/pipeline">
        Open live pipeline
      </Link>
    </main>
  );
}
