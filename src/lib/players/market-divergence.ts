/**
 * ADP-vs-trade-value market-divergence read (CANONICAL).
 *
 * Two markets price each player: the draft market (ADP, where consensus
 * picks) and the trade market (FantasyCalc / KTC overall rank). When they
 * disagree, the gap is the founder-flagged signal (Adonai Mitchell case
 * 2026-05-24: Sleeper Dyn-SF ADP 196, FantasyCalc value rank 242, so the
 * draft market drafts him 46 picks earlier than the trade market ranks
 * him). Neutral framing: the helper reports both numbers and the size of
 * the gap; it does not push a verdict. The user decides whether ADP is
 * overpaying or the trade market is sleeping.
 *
 * Returns null when either input is absent or the gap is below
 * `MEANINGFUL_GAP_PICKS` (15). Returning null is the "the two markets
 * agree (within noise)" signal; callers hide the line in that case.
 *
 * Pure function, no IO. Safe to import in client components.
 * Registered in CANONICAL_SOURCES.md.
 */

// A 15-pick gap is the threshold for "the two markets disagree." Below
// that, the difference is rank noise (KTC reshuffles weekly, ADP slow-
// moves with sample), not a real disagreement.
const MEANINGFUL_GAP_PICKS = 15;

export type MarketDivergenceLean = "adp_earlier" | "value_earlier";

export type MarketDivergence = {
  /** Absolute pick gap between ADP rank and trade-value rank. */
  gap: number;
  /**
   * Which market goes earlier:
   *  - "adp_earlier"   : draft market drafts him before the trade market ranks him (Mitchell case).
   *  - "value_earlier" : trade market ranks him before the draft market drafts him.
   */
  lean: MarketDivergenceLean;
  /** Compact display line. "ADP 196 · value rank 242". */
  line: string;
  /** Trailing detail. "ADP 46 earlier" / "value 46 earlier". */
  detail: string;
};

export function readMarketDivergence(args: {
  adp: number | null | undefined;
  valueRank: number | null | undefined;
}): MarketDivergence | null {
  const { adp, valueRank } = args;
  if (adp == null || valueRank == null) return null;
  const rawGap = Math.round(valueRank - adp);
  const gap = Math.abs(rawGap);
  if (gap < MEANINGFUL_GAP_PICKS) return null;
  // Positive raw gap (valueRank - adp > 0) means value rank is the higher
  // number = LATER on the trade-market list = the trade market values him
  // LESS than the draft market drafts him. So the DRAFT market is earlier.
  // Negative raw gap = value market is earlier.
  const lean: MarketDivergenceLean = rawGap > 0 ? "adp_earlier" : "value_earlier";
  return {
    gap,
    lean,
    line: `ADP ${Math.round(adp)} · value rank ${Math.round(valueRank)}`,
    detail: lean === "adp_earlier" ? `ADP ${gap} earlier` : `value ${gap} earlier`,
  };
}
