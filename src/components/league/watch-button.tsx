"use client";

/**
 * Compact toggle button for adding a player to the watchlist. Renders
 * as a small chip ("Stalk" / "Stalking") next to player names on the
 * Decision card. Idempotent: clicking when already stalking removes
 * the entry.
 *
 * Companion to lib/watchlist. Zero network on click; localStorage
 * write + custom event so the watchlist strip updates live.
 */

import { useEffect, useState } from "react";
import {
  addToWatchlist,
  isWatching,
  removeFromWatchlist,
  subscribeWatchlist,
} from "@/lib/watchlist";

export function WatchButton({
  leagueId,
  player,
  currentUserPickNo,
}: {
  leagueId: string;
  player: {
    player_id: string;
    player_name: string;
    position: string | null;
    team: string | null;
  };
  currentUserPickNo: number | null;
}) {
  const [watching, setWatching] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setWatching(isWatching(leagueId, player.player_id));
    const unsubscribe = subscribeWatchlist(leagueId, () => {
      setWatching(isWatching(leagueId, player.player_id));
    });
    return unsubscribe;
  }, [leagueId, player.player_id]);

  // Don't render server-side; the button's state depends on
  // localStorage which is client-only.
  if (!mounted) return null;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (watching) {
      removeFromWatchlist(leagueId, player.player_id);
    } else {
      addToWatchlist(leagueId, {
        player_id: player.player_id,
        player_name: player.player_name,
        position: player.position,
        team: player.team,
        added_at_user_pick_no: currentUserPickNo,
      });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        watching
          ? "Stop tracking this player"
          : "Track this player across refreshes"
      }
      className={`rounded-sm border px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
        watching
          ? "border-accent/60 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border-soft bg-transparent text-muted-2 hover:border-accent/40 hover:text-accent"
      }`}
    >
      {watching ? "Stalking" : "Stalk"}
    </button>
  );
}
