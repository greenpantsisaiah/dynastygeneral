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
import type { PlanSnipe } from "@/lib/last-visit/plan-disruption";
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

/**
 * Play-broken beat: a named follow-through target of an active committed
 * play was drafted by an opponent SINCE the user's last visit. The
 * companion reads the canonical between-visit snipe diff (PlanDisruption,
 * the same signal LastVisitDigest surfaces) and cross-references it against
 * committed plays, rather than re-deriving the roster state. Because it is
 * driven by the between-visit diff, it fires on the TRANSITION (just got
 * sniped), not on every visit while the play sits broken, which keeps it
 * honest-first (a real event, not manufactured drama).
 *
 * Client-side only (committed plays live in localStorage); the snipes are
 * computed server-side and handed down. Mirrors The Call's discipline of
 * naming a broken play by its sniped piece and the holder.
 */
export function classifyPlayBrokenBeats(args: {
  /** The user's active committed plays (getActivePlayCommitments). */
  commitments: PlayCommitment[];
  /** Plan targets drafted by an opponent since last visit (PlanDisruption). */
  snipes: PlanSnipe[];
  stage?: BeatStage;
}): Beat[] {
  const { commitments, snipes } = args;
  if (snipes.length === 0) return [];
  const stage = args.stage ?? "dynasty_draft";
  const snipeById = new Map(snipes.map((s) => [s.player_id, s]));
  const beats: Beat[] = [];
  const seen = new Set<string>();
  for (const c of commitments) {
    if (c.status !== "active" || seen.has(c.play_name)) continue;
    // The first (most recently) sniped follow-through target breaks the play.
    const brokenTarget = c.followthrough_targets.find((t) =>
      snipeById.has(t.player_id),
    );
    if (!brokenTarget) continue;
    const snipe = snipeById.get(brokenTarget.player_id)!;
    seen.add(c.play_name);
    beats.push(
      finalizeBeat({
        kind: "play_broken",
        tone: "commiserate",
        stage,
        // The pivot is a Coach conversation (trade for the piece or
        // reshape the play), so offer the handoff.
        prompts_handoff: true,
        source: {
          signal: "active_play_sniped",
          detail: `${snipe.player_name}, a follow-through target of the committed play "${c.play_name}" (${c.archetype}), was drafted by ${snipe.drafted_by_owner ?? "another manager"} at pick ${snipe.pick_no}`,
          values: {
            play_name: c.play_name,
            sniped: snipe.player_name,
            holder: snipe.drafted_by_owner ?? null,
            pick_no: snipe.pick_no,
            magnitude: 3,
          },
        },
      }),
    );
  }
  return beats;
}
