/**
 * Loads the prices for one pasted offer: players from the decision
 * context's trade-pricing values (the value seam), future rookie picks from
 * `resolveFuturePickValues` aligned with `alignPicksToScoring`, the same
 * pick prices the sell cards' asks use (`attachAskLadders`). Redraft
 * leagues have no picks to price.
 */
import { resolvePlayers } from "@/lib/players/cache";
import { futurePickKey, resolveFuturePickValues } from "@/lib/players/values";
import { alignPicksToScoring } from "@/lib/players/value-mode";
import { playerPosition } from "@/lib/strategy/archetypes/schema";
import type { DecisionContext } from "./context";
import { normalizeName, priceOffer, type OfferValues, type PlayerRef } from "./offer-values";

export async function loadOfferValues(
  ctx: DecisionContext,
  offer: { you_send: string[]; you_receive: string[] },
): Promise<OfferValues> {
  const values = ctx.pricing.player_values;
  const ids = Object.keys(values);
  const meta = await resolvePlayers(ids);
  const players = new Map<string, PlayerRef[]>();
  for (const [id, p] of meta) {
    const name = p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    const key = normalizeName(name);
    const ref: PlayerRef = { id, name, position: playerPosition(p), age: p.age ?? null };
    players.set(key, [...(players.get(key) ?? []), ref]);
  }

  let pickValues = new Map<string, number>();
  if (ctx.league.format_type !== "redraft") {
    const hl = ctx.league.scoring_highlights;
    const isHalfPpr = hl.some((s) => /half.?PPR/i.test(s));
    const market = await resolveFuturePickValues({
      isSuperflex: ctx.league.is_superflex,
      isPpr: hl.some((s) => /\bPPR\b/i.test(s)) && !isHalfPpr,
      isHalfPpr,
    });
    const scoredById: Record<string, number> = {};
    for (const [id, v] of Object.entries(values)) scoredById[id] = v.value;
    pickValues = alignPicksToScoring({ ...market, scoredById });
  }

  return priceOffer({
    send: offer.you_send,
    receive: offer.you_receive,
    players,
    playerValue: (id) => values[id]?.value,
    pickValue: (season, round, tier) => pickValues.get(futurePickKey(season, round, tier)),
    bandPct: ctx.pricing.fairness_band_pct,
  });
}
