/**
 * What to ask for: an acceptable-to-great range of concrete returns from
 * the buyer's own roster (Isaiah, 2026-11-26: "this doesn't tell me what
 * to sell Jaylen for... a range of acceptable to awesome").
 *
 * Every rung is one real player the buyer rosters, priced on the same
 * scoring scale as the player being sold (the VALUE_MODE seam values the
 * priced pool already computed for every roster). No new value math lives
 * here: the bands only place the buyer's players around the seller's value.
 *
 * Bands are relative to the sold player's value. The floor band sits inside
 * the +/-15% fairness band the trade-realism tester enforces; "great" is
 * above it, an overpay the buyer may still accept when they are short at
 * the position. FIXME: hardcoded, no canonical yet. Register with the
 * trade advisor once acceptance outcomes are logged.
 */

export interface AskRung {
  player_id: string;
  name: string;
  position: string;
  value: number;
  /**
   * A smaller second piece from the same roster when no single player lands
   * in the band ("DJ Moore plus Rome Odunze"). `value` is then the package total.
   */
  plus?: Omit<AskRung, "plus">;
}

export interface AskLadder {
  /** The lowest return worth taking. */
  floor: AskRung | null;
  /** About even by value: what to open with. */
  fair: AskRung | null;
  /** A clearly better return, worth asking for if the buyer is desperate. */
  great: AskRung | null;
  /** The sold player's value the bands are relative to. */
  target_value: number;
}

export const ASK_BANDS = {
  floor: [0.85, 0.95],
  fair: [0.95, 1.1],
  great: [1.1, 1.35],
} as const;
const ANCHOR = { floor: 0.9, fair: 1.0, great: 1.2 } as const;
const SKILL = new Set(["QB", "RB", "WR", "TE"]);
/** Pairs are searched among the buyer's top N players only. */
const PAIR_POOL = 25;

export function buildAskLadder(args: {
  targetValue: number;
  /** Players the buyer rosters, with scoring values. */
  offers: AskRung[];
  /** The sold player's position: the buyer is short there, so their players at it are not a return. */
  excludePosition: string;
}): AskLadder | null {
  const v = args.targetValue;
  if (!(v > 0)) return null;
  const pool = args.offers.filter(
    (o) => o.value > 0 && SKILL.has(o.position) && o.position !== args.excludePosition,
  );
  const used = new Set<string>();
  const pick = (band: keyof typeof ASK_BANDS): AskRung | null => {
    const [lo, hi] = ASK_BANDS[band];
    const inBand = pool.filter((o) => !used.has(o.player_id) && o.value >= v * lo && o.value < v * hi);
    if (inBand.length === 0) return null;
    const anchor = v * ANCHOR[band];
    inBand.sort((a, b) => Math.abs(a.value - anchor) - Math.abs(b.value - anchor) || a.player_id.localeCompare(b.player_id));
    used.add(inBand[0].player_id);
    return inBand[0];
  };
  // No single player in the band: try a main piece plus the smallest add-on
  // that lands the package in it (largest main piece first, fewest moving parts).
  const pickPair = (band: keyof typeof ASK_BANDS): AskRung | null => {
    const [lo, hi] = ASK_BANDS[band];
    const free = pool.filter((o) => !used.has(o.player_id)).sort((a, b) => b.value - a.value || a.player_id.localeCompare(b.player_id)).slice(0, PAIR_POOL);
    const find = (): { main: AskRung; add: AskRung; total: number } | null => {
      for (const main of free) {
        if (main.value >= v * lo) continue;
        for (const add of [...free].reverse()) {
          if (add.player_id === main.player_id || add.value > main.value) continue;
          const total = main.value + add.value;
          if (total >= v * lo && total < v * hi) return { main, add, total };
        }
      }
      return null;
    };
    const best = find();
    if (!best) return null;
    used.add(best.main.player_id);
    used.add(best.add.player_id);
    return { ...best.main, value: Math.round(best.total * 100) / 100, plus: best.add };
  };
  const fair = pick("fair");
  const floor = pick("floor");
  const great = pick("great");
  const out = {
    fair: fair ?? pickPair("fair"),
    floor,
    great: great ?? pickPair("great"),
  };
  if (!out.fair && !out.floor && !out.great) return null;
  return { ...out, target_value: v };
}
