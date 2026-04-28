"use client";

/**
 * Watchlist strip. Pinned at the top of the hub above the Decision
 * card during active drafts. Shows each watched player with current
 * status:
 *
 *   STILL ON BOARD          (success tone, default)
 *   STANDING CALL           (accent tone, brightest, this is your guy)
 *   DRAFTED at pick X by Y  (warning tone, fades when acknowledged)
 *
 * Auto-renders nothing when watchlist is empty. Auto-listens to the
 * watchlist change event so adds/removes anywhere in the app update
 * live without a refresh.
 *
 * Per founder direction 2026-04-28 ("stalking" is a first-class
 * affordance), the strip uses the word "stalking" in its header to
 * preserve the user's mental model.
 */

import { useEffect, useState } from "react";
import {
  readWatchlist,
  removeFromWatchlist,
  subscribeWatchlist,
  type WatchEntry,
} from "@/lib/watchlist";

type DraftedDetail = {
  pick_no: number;
  owner_name: string | null;
};

export function WatchlistStrip({
  leagueId,
  draftedById,
  standingCallId,
}: {
  leagueId: string;
  draftedById: Record<string, DraftedDetail>;
  standingCallId: string | null;
}) {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEntries(readWatchlist(leagueId).entries);
    const unsubscribe = subscribeWatchlist(leagueId, () => {
      setEntries(readWatchlist(leagueId).entries);
    });
    return unsubscribe;
  }, [leagueId]);

  if (!mounted || entries.length === 0) return null;

  return (
    <section className="mt-6 rounded-md border border-border-strong bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Stalking · {entries.length} player{entries.length === 1 ? "" : "s"}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          Click any chip to stop tracking
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {entries.map((entry) => {
          const drafted = draftedById[entry.player_id] ?? null;
          const isStandingCall =
            standingCallId === entry.player_id;
          let toneClass: string;
          let statusText: string;
          if (drafted) {
            toneClass = "border-warning/50 bg-warning/10 text-warning";
            const ownerLabel = drafted.owner_name ?? "the room";
            statusText = `drafted ${drafted.pick_no} · ${ownerLabel}`;
          } else if (isStandingCall) {
            toneClass = "border-accent/60 bg-accent/15 text-accent";
            statusText = "standing call";
          } else {
            toneClass = "border-success/40 bg-success/5 text-success";
            statusText = "on board";
          }
          return (
            <li key={entry.player_id}>
              <button
                type="button"
                onClick={() =>
                  removeFromWatchlist(leagueId, entry.player_id)
                }
                title="Stop tracking this player"
                className={`group flex items-baseline gap-2 rounded-md border px-2.5 py-1.5 transition ${toneClass} hover:opacity-80`}
              >
                <span className="font-semibold text-foreground">
                  {entry.player_name}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
                  {entry.position ?? "?"}
                  {entry.team ? `-${entry.team}` : ""} · {statusText}
                </span>
                <span className="font-mono text-[10px] text-muted-2 group-hover:text-foreground">
                  ✕
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
