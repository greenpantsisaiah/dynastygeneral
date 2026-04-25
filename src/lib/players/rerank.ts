/**
 * Consensus-aware re-rank cascade.
 *
 * Sleeper's `/players/nfl` API publishes a `search_rank` field that
 * is its universal NFL search ranking. That field is what
 * `available.ts` uses as the seed for `dynasty_rank` (search_rank ×
 * age × position). For most players it tracks dynasty community
 * consensus closely. For some players (notably non-rookie TEs in
 * dynasty leagues) it can lag the market by 10-15 spots.
 *
 * Critically: Sleeper's WEBSITE draftboard "RK" column is NOT the
 * same field. The website uses a draft-specific or league-format-
 * specific ranking. Per audit 2026-04-25 the gap was real (LaPorta:
 * Sleeper API search_rank = 79; Sleeper draftboard "RK" = 68) but it
 * is NOT a cache bug. Both are "correct" by their own definitions.
 *
 * The fix is not to chase Sleeper's website ranking; it is to use
 * the dynasty community's actual consensus when we have it. That
 * means: KTC-equivalent values from FantasyCalc when available, ADP
 * when KTC is missing, our heuristic dynasty_rank as a final
 * fallback. This module exposes that cascade as a single helper so
 * every downstream surface (Decision card, Strategic Forks, scout)
 * uses the same canonical ordering.
 *
 * Shape requirement: items must carry `player_id` (or `id`) so we
 * can look up KTC value, and an optional `adp` field. Anything else
 * is preserved.
 */

export type RerankItem = {
  player_id?: string;
  id?: string;
  adp?: number | null;
};

/**
 * Sort items in place by the consensus cascade and return the new
 * array. Original `items` array is NOT mutated; a new sorted array
 * is returned.
 *
 * Cascade:
 *   Tier 1 (KTC value present): higher value first.
 *   Tier 2 (ADP present, no KTC): lower ADP first.
 *   Tier 3 (neither): preserve relative input order via stable sort.
 *
 * Tier 1 wins over tier 2 wins over tier 3 unconditionally. So a
 * KTC-valued bench piece sorts above an ADP-only top-rookie at this
 * level; consumers that want different behavior should pre-filter.
 */
export function rerankByConsensus<T extends RerankItem>(
  items: readonly T[],
  playerValues: Record<string, number>,
): T[] {
  const idOf = (x: T): string =>
    (typeof x.player_id === "string" && x.player_id) ||
    (typeof x.id === "string" && x.id) ||
    "";
  type Tagged = { x: T; tier: 1 | 2 | 3; key: number; idx: number };
  const tagged: Tagged[] = items.map((x, idx) => {
    const id = idOf(x);
    const v = id ? playerValues[id] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
      return { x, tier: 1, key: -v, idx }; // higher value first via negation
    }
    const adp = x.adp;
    if (typeof adp === "number" && Number.isFinite(adp)) {
      return { x, tier: 2, key: adp, idx };
    }
    return { x, tier: 3, key: 0, idx };
  });
  tagged.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.key !== b.key) return a.key - b.key;
    return a.idx - b.idx; // stable for equal keys
  });
  return tagged.map((t) => t.x);
}
