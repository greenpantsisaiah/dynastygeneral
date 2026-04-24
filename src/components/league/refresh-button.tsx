"use client";

/**
 * "Refresh" button on the league hub. Hits the league refresh endpoint
 * (which busts the Sleeper-fetch cache for this route) and then
 * router.refresh()s so the new state renders.
 *
 * Most useful during the NFL Draft window and right after a league
 * pick lands: the inner Sleeper fetches use `revalidate: 60-300s`, so
 * a fresh draft pick or a newly-drafted rookie can take a minute or
 * more to show up. This button gives the user a "now" escape hatch.
 *
 * Subtle by default; loud red on hover-during-pending so the user
 * knows it's working.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "refreshing" | "ok" | "error";

export function RefreshButton({
  leagueId,
}: {
  leagueId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  async function refresh() {
    if (status === "refreshing") return;
    setStatus("refreshing");
    try {
      const res = await fetch(`/api/league/${leagueId}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      router.refresh();
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const label =
    status === "refreshing"
      ? "Refreshing..."
      : status === "ok"
        ? "Up to date"
        : status === "error"
          ? "Refresh failed"
          : "Refresh now";

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={status === "refreshing"}
      className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-accent/60 hover:text-accent disabled:opacity-60"
      title="Bust Sleeper-fetch cache for this league"
    >
      {label}
      {status === "idle" && (
        <span className="ml-2 text-accent" aria-hidden>
          ↻
        </span>
      )}
    </button>
  );
}
