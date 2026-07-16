"use client";

import { useState } from "react";
import { readCookieValue } from "../lib/browser-cookie.mjs";

export function LogoutButton() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function logout() {
    if (pending) return;
    setMessage("");
    setPending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          origin: window.location.origin,
          "x-csrf-token": readCookieValue(document.cookie, "kendall_operator_csrf"),
        },
      });
      if (!response.ok) throw new Error();
      window.location.assign("/");
    } catch {
      setMessage("Sign-out was not accepted. Try again.");
      setPending(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="cursor-pointer rounded-[0.375rem] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-sm transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
        aria-label="Sign out of the Kendall dashboard"
        disabled={pending}
        onClick={logout}
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {message ? <span role="status" className="text-xs text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
