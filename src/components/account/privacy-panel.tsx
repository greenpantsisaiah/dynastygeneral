"use client";

/**
 * Privacy controls on the account page. Today: one button that wipes
 * all server-stored coach chats and pinned briefings across every
 * league (right-to-be-forgotten for product data). The localStorage
 * mirror on this device stays. Clearing site data in the browser
 * removes the local copy.
 *
 * Two-step confirm to prevent fat-finger destruction. The destructive
 * action is loud red on hover; the default state is muted so it
 * doesn't visually shout at users who weren't looking for it.
 */

import { useState } from "react";

type Status = "idle" | "confirming" | "wiping" | "done" | "error";

export function PrivacyPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function wipe() {
    setStatus("wiping");
    setError(null);
    try {
      const res = await fetch("/api/account/wipe-data", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong. Refresh and try again.");
      }
      setStatus("done");
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Privacy
      </div>
      <p className="mt-2 text-sm text-muted">
        Export everything we have on you, or wipe every server-stored coach
        chat and pinned briefing across all your leagues. Local copies in
        this browser are not affected; clear site data in your browser
        settings to remove those too. Wipes cannot be undone.
      </p>

      {status === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/api/account/export-data"
            className="inline-flex h-9 items-center rounded-md border border-border-strong bg-background px-4 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Export my data (JSON)
          </a>
          <button
            type="button"
            onClick={() => setStatus("confirming")}
            className="inline-flex h-9 items-center rounded-md border border-border-strong bg-background px-4 text-xs font-medium text-muted transition hover:border-danger hover:text-danger"
          >
            Wipe my server data
          </button>
        </div>
      )}

      {status === "confirming" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-danger">
            Sure?
          </span>
          <button
            type="button"
            onClick={wipe}
            className="inline-flex h-9 items-center rounded-md border border-danger bg-danger/10 px-4 text-xs font-semibold text-danger transition hover:bg-danger hover:text-black"
          >
            Yes, wipe everything
          </button>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="inline-flex h-9 items-center rounded-md border border-border-strong bg-background px-4 text-xs font-medium text-foreground transition hover:border-accent/60"
          >
            Cancel
          </button>
        </div>
      )}

      {status === "wiping" && (
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-muted">
          Wiping...
        </div>
      )}

      {status === "done" && (
        <div className="mt-3 rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-foreground">
          Server data wiped. Local copies in this browser still exist; clear
          site data to remove.
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error ?? "Wipe failed. Try again or contact support."}
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="ml-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
