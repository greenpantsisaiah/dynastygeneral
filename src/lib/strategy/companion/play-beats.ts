/**
 * Play-reaction beats (Principle 13, the Companion <-> Plays integration).
 * The companion REACTS to the plays system by reading its canonical state,
 * not re-deriving it: when the user's most recent pick is a follow-through
 * target of an active committed play, that play advanced.
 *
 * Client-side only (committed plays live in localStorage). Mirrors the
 * decision-board's `advancesByPlayer` matching (followthrough_targets), so
 * the companion and The Call agree on what "advances" means. Client-safe:
 * imports only plays/companion types + the deterministic voice phraser.
 */

import type { PlayCommitment } from "@/lib/strategy/plays/types";
import { finalizeBeat } from "./voice";
import type { Beat, BeatStage } from "./types";

export function classifyPlayAdvancedBeats(args: {
  /** The user's active committed plays (getActivePlayCommitments). */
  commitments: PlayCommitment[];
  /** The user's most recent pick since last visit. */
  latestPick: { player_id: string; name: string } | null;
  stage?: BeatStage;
}): Beat[] {
  const { commitments, latestPick } = args;
  if (!latestPick) return [];
  const stage = args.stage ?? "dynasty_draft";
  const beats: Beat[] = [];
  const seen = new Set<string>();
  for (const c of commitments) {
    if (c.status !== "active") continue;
    const isTarget = c.followthrough_targets.some(
      (t) => t.player_id === latestPick.player_id,
    );
    if (!isTarget || seen.has(c.play_name)) continue;
    seen.add(c.play_name);
    const remaining = c.followthrough_targets.filter(
      (t) => t.player_id !== latestPick.player_id,
    );
    beats.push(
      finalizeBeat({
        kind: "play_advanced",
        tone: "win",
        stage,
        source: {
          signal: "active_play_followthrough",
          detail: `${latestPick.name} is a follow-through target of the committed play "${c.play_name}" (${c.archetype})`,
          values: {
            play_name: c.play_name,
            pick: latestPick.name,
            next_target: remaining[0]?.name ?? null,
            remaining: remaining.length,
            magnitude: 3,
          },
        },
      }),
    );
  }
  return beats;
}
