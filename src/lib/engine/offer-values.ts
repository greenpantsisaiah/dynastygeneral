/**
 * Offer values: the price of every piece in a pasted trade, on the one
 * 0-100 scoring scale, handed to the trade check so the model quotes
 * numbers instead of inventing them.
 *
 * Why (2026-11-28, revert #176): on a live check of "Jaylen Warren for a
 * 2027 1st" the model said Warren's value "isn't in the payload" and priced
 * the 1st at 57-65 in one sentence and 80-95 in another. Per INVARIANTS
 * ("treat 'I don't have X' as a context-construction bug") the fix is the
 * context: players priced through the trade-pricing values (the value
 * seam), future rookie picks through `resolveFuturePickValues` aligned with
 * `alignPicksToScoring` (the same pick prices the sell cards' asks use).
 * A piece that cannot be priced is named as unpriced, never guessed.
 *
 * Pure: the caller supplies the lookups.
 */

import type { PickTier } from "@/lib/players/values";

export interface PricedPiece {
  /** What the user typed. */
  input: string;
  kind: "player" | "pick" | "unpriced";
  /** "Jaylen Warren (RB, age 27)" / "2027 1st" / the input when unpriced. */
  label: string;
  value: number | null;
}

export interface OfferValues {
  send: PricedPiece[];
  receive: PricedPiece[];
  send_total: number;
  receive_total: number;
  /** receive_total / send_total, null when a side totals 0. */
  ratio: number | null;
  /** Fairness band, percent (the pricing block's ±15%). */
  band_pct: number;
  /** True when every piece is priced. Totals are partial otherwise. */
  complete: boolean;
}

export interface PlayerRef {
  id: string;
  name: string;
  position: string | null;
  age?: number | null;
}

/** Lowercase, no punctuation, no generational suffix: "D.J. Moore Jr." -> "dj moore". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROUND_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

/**
 * A future rookie pick in the user's words: "2027 1st", "their late 2027 1st",
 * "2028 2nd round pick", "2027 first". Null when the text is not a pick or
 * names no season (a bare "1st" has no price).
 */
export function parsePickPiece(s: string): { season: string; round: number; tier?: PickTier } | null {
  const t = s.toLowerCase();
  const season = t.match(/\b(20\d\d)\b/)?.[1];
  if (!season) return null;
  const num = t.match(/\b([1-7])(?:st|nd|rd|th)\b/)?.[1];
  const word = t.match(/\b(first|second|third|fourth|fifth)\b/)?.[1];
  const roundAlone = t.match(/\bround\s*([1-7])\b|\br([1-7])\b/);
  const round = num ? Number(num) : word ? ROUND_WORDS[word] : roundAlone ? Number(roundAlone[1] ?? roundAlone[2]) : null;
  if (!round) return null;
  const tier = (t.match(/\b(early|mid|late)\b/)?.[1] as PickTier | undefined) ?? undefined;
  return tier ? { season, round, tier } : { season, round };
}

const ORD = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export function priceOffer(args: {
  send: string[];
  receive: string[];
  /** Every rostered player in the league, by normalized full name. */
  players: Map<string, PlayerRef[]>;
  playerValue: (id: string) => number | undefined;
  /** Future pick price on the same scale; undefined when not priced (or redraft). */
  pickValue: (season: string, round: number, tier?: PickTier) => number | undefined;
  bandPct: number;
}): OfferValues {
  const price = (input: string): PricedPiece => {
    const raw = input.trim();
    const pick = parsePickPiece(raw);
    if (pick) {
      const tiered = pick.tier ? args.pickValue(pick.season, pick.round, pick.tier) : undefined;
      const v = tiered ?? args.pickValue(pick.season, pick.round);
      const label = `${tiered != null && pick.tier ? `${pick.tier} ` : ""}${pick.season} ${ORD(pick.round)}`;
      return typeof v === "number" ? { input: raw, kind: "pick", label, value: Math.round(v) } : { input: raw, kind: "unpriced", label: raw, value: null };
    }
    const hits = args.players.get(normalizeName(raw)) ?? [];
    if (hits.length === 1) {
      const v = args.playerValue(hits[0].id);
      const h = hits[0];
      const tags = [h.position, typeof h.age === "number" ? `age ${Math.round(h.age)}` : null].filter(Boolean);
      const label = `${h.name}${tags.length ? ` (${tags.join(", ")})` : ""}`;
      return typeof v === "number" ? { input: raw, kind: "player", label, value: Math.round(v) } : { input: raw, kind: "unpriced", label, value: null };
    }
    return { input: raw, kind: "unpriced", label: raw, value: null };
  };
  const send = args.send.filter((s) => s.trim()).map(price);
  const receive = args.receive.filter((s) => s.trim()).map(price);
  const total = (xs: PricedPiece[]) => xs.reduce((a, p) => a + (p.value ?? 0), 0);
  const send_total = total(send);
  const receive_total = total(receive);
  return {
    send,
    receive,
    send_total,
    receive_total,
    ratio: send_total > 0 && receive_total > 0 ? receive_total / send_total : null,
    band_pct: args.bandPct,
    complete: [...send, ...receive].every((p) => p.kind !== "unpriced"),
  };
}

/** The prompt block. Every number the analysts may quote about this offer is here. */
export function renderOfferValues(o: OfferValues): string {
  const line = (p: PricedPiece) => (p.value == null ? `  · ${p.label}: UNPRICED (no value on file; do not put a number on it)` : `  · ${p.label}: ${p.value}`);
  const out = [
    `## Offer values (0-100 trade scale; the ONLY prices to quote for these pieces)`,
    `- You send, total ${o.send_total}:`,
    ...o.send.map(line),
    `- You receive, total ${o.receive_total}:`,
    ...o.receive.map(line),
  ];
  if (o.ratio != null) {
    const pct = Math.round((o.ratio - 1) * 100);
    const inBand = Math.abs(pct) <= o.band_pct;
    out.push(
      `- Receive vs send: ${pct >= 0 ? "+" : ""}${pct}% (${Math.abs(o.receive_total - o.send_total)} points ${o.receive_total >= o.send_total ? "in your favor" : "against you"}); ${inBand ? "inside" : "outside"} the ±${o.band_pct}% band.`,
    );
    const lo = Math.round(o.send_total * (1 - o.band_pct / 100));
    const hi = Math.round(o.send_total * (1 + o.band_pct / 100));
    out.push(`- Fair band for what you receive: ${lo} to ${hi} points.`);
  }
  if (!o.complete) out.push(`- Totals leave out the UNPRICED pieces. Say a piece is unpriced; never estimate its value.`);
  return out.join("\n");
}
