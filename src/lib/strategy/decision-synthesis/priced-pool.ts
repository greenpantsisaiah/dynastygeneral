/**
 * Canonical priced-pool builder.
 *
 * Every surface that synthesizes a per-pick decision (the hub board and
 * Coach) needs the SAME priced, reranked, depth-annotated inputs, or the
 * two surfaces silently disagree on the standing call. This helper owns
 * that prelude so it lives in exactly one place:
 *
 *   1. fetch the realistic available pool (`getAvailableForRequest`)
 *   2. price EVERY rostered player across the league PLUS the full
 *      available pool (`resolvePlayerValues`)
 *   3. harmonize the available ordering by the consensus cascade
 *      (`rerankByConsensus`)
 *   4. annotate the snapshot with value-calibrated startable / stable
 *      depth (`annotateStartableDepth`)
 *
 * The all-rosters pricing in step 2 is LOAD-BEARING, not a nicety.
 * `annotateStartableDepth` builds the leaguewide startable tier from
 * priced bodies only (a player with no value is excluded from the tier).
 * If a caller prices only `me + available`, opponents' rostered players
 * are unpriced and drop out of the tier, which inflates the user's own
 * startable counts, which flips the `fill_starter` + saturation gates
 * inside `synthesizeDecision`, which crowns a different standing call.
 *
 * Bug class this prevents (2026-05-24): the hub board recommended Jaylin
 * Noel while Coach recommended Adonai Mitchell for the same pick, because
 * Coach priced only `me + available` (route.ts) while the hub priced all
 * rosters (page.tsx). Two hand-copied preludes had drifted on one line.
 * Both surfaces now call this; they cannot diverge on pricing again.
 */
import { getAvailableForRequest } from "@/lib/strategy/player-suggestions/enrich";
import { resolvePlayerValues } from "@/lib/players/values";
import { rerankByConsensus } from "@/lib/players/rerank";
import { annotateStartableDepth } from "@/lib/engine/roster-fit";
import { resolvePlayers } from "@/lib/players/cache";
import { normalizePosition } from "@/lib/strategy/archetypes/schema";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type { AvailablePlayer } from "@/lib/players/available";
import type { PlayerValue } from "@/lib/players/values";

export interface PricedPool {
  /** Reranked realistic pool, consensus-cascade ordered. */
  available: AvailablePlayer[];
  /** Full FantasyCalc value map (all rosters + available). */
  valueMap: Map<string, PlayerValue>;
  /** Convenience record: id -> normalized 0-100 value. */
  playerValuesById: Record<string, number>;
  /** Convenience record: id -> KTC overall rank (when present). */
  ktcOverallRanksById: Record<string, number>;
}

/**
 * Build the priced, reranked, depth-annotated pool for a snapshot.
 * MUTATES `snap` in place via `annotateStartableDepth` (the same in-place
 * contract the callers already relied on). Best-effort: a values or
 * rerank failure leaves `available` in its raw `getAvailableForRequest`
 * ordering and the value maps empty, exactly as the inline callers
 * degraded before, but the failure is logged with message + stack.
 */
export async function buildPricedPool(
  snap: LeagueSnapshot,
): Promise<PricedPool> {
  let available = await getAvailableForRequest(snap).catch((err) => {
    console.error(
      "[priced-pool:available]",
      err instanceof Error ? `${err.message}\n${err.stack}` : err,
    );
    return [] as AvailablePlayer[];
  });

  let valueMap = new Map<string, PlayerValue>();
  const playerValuesById: Record<string, number> = {};
  const ktcOverallRanksById: Record<string, number> = {};

  try {
    const valueIds: string[] = [];
    // Price EVERY rostered player across the league. Without opponents,
    // the leaguewide startable tier collapses to the user's own bodies
    // and `startable_counts[me]` inflates. See the file header.
    for (const r of snap.rosters) {
      for (const id of r.player_ids ?? []) valueIds.push(id);
    }
    // Plus the full available pool so the rerank cascade sees every
    // player the engine might rank, not a top-N slice.
    for (const p of available) valueIds.push(p.id);

    valueMap = await resolvePlayerValues({
      ids: valueIds,
      isSuperflex: snap.format === "superflex" || snap.format === "2qb",
      isPpr: snap.scoring.includes("PPR"),
      isHalfPpr: snap.scoring.includes("half-PPR"),
      isTePremium: snap.scoring.includes("TE-premium"),
    });
    for (const [id, v] of valueMap.entries()) {
      playerValuesById[id] = v.value;
      if (typeof v.overall_rank === "number") {
        ktcOverallRanksById[id] = v.overall_rank;
      }
    }

    available = rerankByConsensus(available, playerValuesById);
  } catch (err) {
    console.error(
      "[priced-pool:values]",
      err instanceof Error ? `${err.message}\n${err.stack}` : err,
    );
  }

  // Annotate value-calibrated startable / stable depth on the snapshot so
  // `synthesizeDecision`'s fill_starter + saturation gates read the same
  // depth on every surface. Needs leaguewide values (above) AND a
  // position lookup over every rostered player.
  if (Object.keys(playerValuesById).length > 0) {
    try {
      const depthIds = new Set<string>();
      for (const r of snap.rosters) {
        for (const id of r.player_ids ?? []) depthIds.add(id);
      }
      const depthPlayers = await resolvePlayers([...depthIds]);
      annotateStartableDepth({
        snap,
        valueOf: (id) => playerValuesById[id] ?? null,
        positionOf: (id) => normalizePosition(depthPlayers.get(id)?.position),
      });
    } catch (err) {
      console.error(
        "[priced-pool:startable-depth]",
        err instanceof Error ? `${err.message}\n${err.stack}` : err,
      );
    }
  }

  return { available, valueMap, playerValuesById, ktcOverallRanksById };
}
