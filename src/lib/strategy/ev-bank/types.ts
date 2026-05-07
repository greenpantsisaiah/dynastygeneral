/**
 * EV Bank: a defensible per-pick + cumulative measure of how much
 * expected value the user has banked above (or below) the market
 * baseline across their picks so far.
 *
 * Design ethos (per user feedback 2026-05-08):
 *   - Statistically grounded, not a vanity sum.
 *   - Sharp locks count as negative against the bank by definition.
 *     (You took a player earlier than the market valued them.)
 *     Whether a sharp lock was "right" is a scarcity question
 *     answered elsewhere; this metric reports raw market math.
 *   - +/- range expresses honest uncertainty, derived from realistic
 *     ADP noise (mock-draft observation puts inter-mock SD at ~3
 *     picks per slot at this stage; this module uses that as the
 *     best/worst envelope).
 *
 * Math:
 *   ev_delta_per_pick = (value / 100) × (pick_no - ADP)
 *     where value is FantasyCalc 0-100 normalized; positive product
 *     means you took a high-value player after the market would have.
 *   ev_bank = Σ ev_delta_per_pick
 *   range_low  = ev_bank computed with all ADPs shifted -ADP_NOISE
 *   range_high = ev_bank computed with all ADPs shifted +ADP_NOISE
 */

export type EvBankPickEntry = {
  pick_no: number;
  pick_label: string;
  player_id: string;
  player_name: string;
  position: string | null;
  // FantasyCalc 0-100. Null when not resolved.
  value: number | null;
  // Sleeper format-aware ADP. Null when not resolved.
  adp: number | null;
  // ev_delta_per_pick. Null when value or ADP is null (excluded from
  // the bank sum + the visualization renders the entry as ungraded).
  ev_delta: number | null;
};

export type EvBank = {
  // Cumulative EV banked across resolved picks. Null when zero
  // resolved picks (every entry is ungraded).
  total_ev: number | null;
  // Best/worst envelope from ±ADP_NOISE on every pick. Null when
  // total_ev is null or only one pick is resolved.
  range_low: number | null;
  range_high: number | null;
  // The ADP noise window used for the envelope, in picks. Surfaced so
  // the panel can label the range honestly ("range from realistic
  // ADP noise of ±N picks"). 3 by default.
  adp_noise_picks: number;
  // Per-pick contribution entries, in pick order.
  entries: EvBankPickEntry[];
  // Quick narrative line for the panel header. "Banked +8.4 EV pts
  // across 4 picks; range +3.1 to +13.7." or "At market rate so far."
  summary: string;
  // Tier color cue for the visualization border.
  tier: "strong" | "solid" | "mixed" | "off_track";
};
