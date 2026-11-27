/**
 * What to ask for: an acceptable-to-great range of concrete returns from
 * the buyer's own roster (Isaiah, 2026-11-26: "this doesn't tell me what
 * to sell Jaylen for... a range of acceptable to awesome").
 *
 * Every rung is one real player the buyer rosters (or one of the buyer's
 * own future rookie picks, priced on the same market scale), priced on the same
 * scoring scale as the player being sold (the VALUE_MODE seam values the
 * priced pool already computed for every roster). No new value math lives
 * here: the bands only place the buyer's players around the seller's value.
 *
 * Seller rules (design QA, 2026-11-26): every rung sits inside the +/-15%
 * fairness band the trade-realism tester enforces; asks come from the
 * buyer's bench (never their current starters, which a contender will not
 * move); no return older than the player sold; younger pieces preferred.
 * In a two-for-one the second piece is discounted (consolidation premium). FIXME: hardcoded, no canonical yet. Register with the
 * trade advisor once acceptance outcomes are logged.
 */

export interface AskRung {
  /** A player id, or `pick:<season>:<round>:<n>` for a future rookie pick. */
  player_id: string;
  /** "pick" for one of the buyer's own future rookie picks (position "PICK"). */
  kind?: "player" | "pick";
  name: string;
  position: string;
  value: number;
  age?: number | null;
  /** In the buyer's lineup last week: never asked for. */
  starter?: boolean;
  /**
   * A smaller second piece from the same roster when no single player lands
   * in the band ("DJ Moore plus Rome Odunze"). `value` is then the package
   * value with the add-on discounted by ADDON_WEIGHT (consolidation premium).
   */
  plus?: Omit<AskRung, "plus">;
}

export interface AskLadder {
  /** The lowest return worth taking. */
  floor: AskRung | null;
  /** About even by value: what to open with. */
  fair: AskRung | null;
  /** A clearly better return, still inside the fairness band. */
  great: AskRung | null;
  /** The sold player's value the bands are relative to. */
  target_value: number;
}

/** All inside +/-15% of the sold player's value. */
export const ASK_BANDS = {
  floor: [0.85, 0.95],
  fair: [0.95, 1.05],
  great: [1.05, 1.15],
} as const;
const ANCHOR = { floor: 0.9, fair: 1.0, great: 1.1 } as const;
const SKILL = new Set(["QB", "RB", "WR", "TE"]);
/**
 * Consolidation premium: in a two-for-one the second piece counts at a
 * discount, because two mid players are worth less than one better one
 * (roster spots, one lineup slot; trade calculators apply the same kind of
 * value adjustment to the side with the best player). FIXME: hardcoded, no
 * canonical yet; calibrate against logged trade acceptances.
 */
export const ADDON_WEIGHT = 0.5;
/** Pairs are searched among the buyer's top N eligible players only. */
const PAIR_POOL = 25;
/** Unknown age sorts after every known age (prefer what we can vouch for). */
const ageKey = (o: AskRung) => (o.kind === "pick" ? PICK_AGE : typeof o.age === "number" ? o.age : 99);
/**
 * A future pick sorts like a rookie of this age: younger than almost any
 * veteran return, so a seller's ask prefers picks to an aging player of the
 * same value. INTERNAL_HEURISTIC (typical NFL rookie age), not calibrated.
 */
const PICK_AGE = 22;

export function buildAskLadder(args: {
  targetValue: number;
  /** Players the buyer rosters, with scoring values, age and starter flag. */
  offers: AskRung[];
  /** The sold player's position: the buyer is short there, so their players at it are not a return. */
  excludePosition: string;
  /** The sold player's age: no return older than him. */
  soldAge?: number | null;
}): AskLadder | null {
  const v = args.targetValue;
  if (!(v > 0)) return null;
  const maxAge = typeof args.soldAge === "number" ? args.soldAge : null;
  const pool = args.offers.filter(
    (o) =>
      o.value > 0 &&
      (o.kind === "pick" ||
        (SKILL.has(o.position) &&
          o.position !== args.excludePosition &&
          !o.starter &&
          (maxAge == null || (typeof o.age === "number" && o.age <= maxAge)))),
  );
  const used = new Set<string>();
  // Youngest first, then closest to the band's anchor.
  const pick = (band: keyof typeof ASK_BANDS): AskRung | null => {
    const [lo, hi] = ASK_BANDS[band];
    const inBand = pool.filter((o) => !used.has(o.player_id) && o.value >= v * lo && o.value <= v * hi);
    if (inBand.length === 0) return null;
    const anchor = v * ANCHOR[band];
    inBand.sort((a, b) => ageKey(a) - ageKey(b) || Math.abs(a.value - anchor) - Math.abs(b.value - anchor) || a.player_id.localeCompare(b.player_id));
    used.add(inBand[0].player_id);
    return inBand[0];
  };
  // No single player in the band: a main piece plus an add-on (discounted)
  // that lands the package in it. Youngest main piece first.
  const pickPair = (band: keyof typeof ASK_BANDS): AskRung | null => {
    const [lo, hi] = ASK_BANDS[band];
    const free = pool
      .filter((o) => !used.has(o.player_id))
      .sort((a, b) => b.value - a.value || a.player_id.localeCompare(b.player_id))
      .slice(0, PAIR_POOL);
    const mains = [...free].sort((a, b) => ageKey(a) - ageKey(b) || b.value - a.value);
    const find = (): { main: AskRung; add: AskRung; total: number } | null => {
      for (const main of mains) {
        if (main.value >= v * lo) continue;
        const adds = free
          .filter((a) => a.player_id !== main.player_id && a.value <= main.value)
          .map((a) => ({ a, total: main.value + ADDON_WEIGHT * a.value }))
          .filter((x) => x.total >= v * lo && x.total <= v * hi)
          .sort((x, y) => ageKey(x.a) - ageKey(y.a) || x.a.value - y.a.value);
        if (adds.length) return { main, add: adds[0].a, total: adds[0].total };
      }
      return null;
    };
    const best = find();
    if (!best) return null;
    used.add(best.main.player_id);
    used.add(best.add.player_id);
    return { ...best.main, value: Math.round(best.total * 100) / 100, plus: best.add };
  };
  const fair = pick("fair") ?? pickPair("fair");
  const floor = pick("floor");
  const great = pick("great") ?? pickPair("great");
  if (!fair && !floor && !great) return null;
  return { fair, floor, great, target_value: v };
}
