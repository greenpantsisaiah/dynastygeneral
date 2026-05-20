"use client";

/**
 * Plays Enabled Callout. Renders on The Call when the standing call
 * enables one or more multi-pick plays. The verb the founder asked
 * for: SEE. Names the play, the upside thesis, the follow-through,
 * and the "genius vs average" framing. Includes a commit button that
 * saves the play to localStorage (the CHOOSE verb).
 *
 * Founder direction 2026-05-20: "A pick isn't genius in isolation.
 * It's genius if I use it well. We have to help me see it, choose
 * it, and then remember it / stay disciplined."
 */

import { useState } from "react";
import type { Play } from "@/lib/strategy/plays/types";
import { archetypeLabel, commitPlay, getPlayCommitments } from "@/lib/plays-storage";

export function PlaysEnabledCallout({
  plays,
  leagueId,
  currentPickNo,
}: {
  plays: Play[];
  leagueId: string;
  currentPickNo: number;
}) {
  if (plays.length === 0) return null;
  return (
    <div className="border-b border-accent/40 bg-accent/5 px-5 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Plays this pick enables
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-2">
        Genius if you execute the follow-through. Average otherwise.
        Commit a play to see discipline reminders on your next picks.
      </p>
      <div className="mt-2 space-y-2">
        {plays.map((play) => (
          <PlayCard
            key={`${play.archetype}-${play.primary_player.player_id}`}
            play={play}
            leagueId={leagueId}
            currentPickNo={currentPickNo}
          />
        ))}
      </div>
    </div>
  );
}

function PlayCard({
  play,
  leagueId,
  currentPickNo,
}: {
  play: Play;
  leagueId: string;
  currentPickNo: number;
}) {
  const [committed, setCommitted] = useState<boolean>(() => {
    // Check if already committed on mount.
    const all = getPlayCommitments(leagueId);
    return all.some(
      (c) =>
        c.archetype === play.archetype &&
        c.primary_player.player_id === play.primary_player.player_id &&
        c.status === "active",
    );
  });

  function handleCommit() {
    commitPlay({ leagueId, play, committedAtPickNo: currentPickNo });
    setCommitted(true);
  }

  return (
    <div className="rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            {archetypeLabel(play.archetype)}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {play.name}
          </span>
        </div>
        {committed ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-success">
            Committed
          </span>
        ) : (
          <button
            type="button"
            onClick={handleCommit}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:text-foreground transition-colors"
          >
            Commit to play
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-foreground">
        {play.genius_vs_average_line}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {play.upside_thesis}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-2">
        <span className="font-mono uppercase tracking-[0.14em]">
          Follow-through:
        </span>{" "}
        {play.followthrough.description}
      </p>
    </div>
  );
}
