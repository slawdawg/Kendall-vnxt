"use client";

import { useState } from "react";

export function LogoutButton() {
  const [message, setMessage] = useState("");
  async function logout() {
    setMessage("");
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          origin: window.location.origin,
          "x-csrf-token": decodeURIComponent(document.cookie.match(/(?:^|; )kendall_operator_csrf=([^;]+)/)?.[1] ?? ""),
        },
      });
      if (!response.ok) throw new Error();
      window.location.assign("/");
    } catch {
      setMessage("Sign-out was not accepted. Try again.");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="rounded-[0.375rem] border px-2 py-1 text-xs text-[var(--muted)]" onClick={logout}>
        Sign out
      </button>
      {message ? <span role="status" className="text-xs text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
