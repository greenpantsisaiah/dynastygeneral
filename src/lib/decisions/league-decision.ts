/**
 * "This week's call" for one league page. The league page shows the same
 * decision item /home and the weekly email build for this league, through
 * the one builder (`buildTradeDeskModel` -> `buildDecisionItems`), so the
 * hub never words the week's call differently from /home.
 *
 * One difference by design: /home caps trade cards at MAX_CARDS across all
 * leagues. A league page shows its own trade card whenever this league
 * qualifies, since the page is the full view of one league.
 */

import type { SleeperLeague } from "@/lib/sleeper/schemas";
import type { ContendOrSellVerdict } from "@/lib/strategy/verdict/compose";
import { buildTradeDeskModel, type BriefTier } from "@/lib/email/trade-desk/model";
import { leagueKind } from "@/lib/email/build-brief";
import { buildDecisionItems, type LeagueCallItem, type TradeItem } from "@/lib/decisions/items";

export function leagueDecision(args: {
  league: SleeperLeague;
  verdict: ContendOrSellVerdict;
  season: string;
  /** Latest week with final scores; the call is for the week after it. */
  resultsWeek: number;
  tier: BriefTier;
  seasonStartDate?: string | null;
  /** Drops a trade whose trade-by time has passed, same as the email. Defaults to the current time. */
  now?: Date;
}): TradeItem | LeagueCallItem | null {
  const model = buildTradeDeskModel({
    ownerName: "",
    tier: args.tier,
    resultsWeek: args.resultsWeek,
    leagues: [
      {
        leagueId: args.league.league_id,
        leagueName: args.league.name.trim(),
        kind: leagueKind(args.league),
        verdict: args.verdict,
        week: null,
      },
    ],
    seasonStartDate: args.seasonStartDate,
    now: args.now ?? new Date(),
  });
  const { items } = buildDecisionItems({ model, season: args.season });
  const found = items.find((i): i is TradeItem | LeagueCallItem => i.kind === "trade" || i.kind === "league_call");
  if (!found) return null;
  if (found.kind === "league_call") return found;
  return forLeaguePage(found);
}

/**
 * The league page's trade card. A one-league model numbers the card "1 of
 * 1" and assumes it was emailed; neither is known from this page, so
 * neither is claimed (an emailed trade keeps its emailed flag). The playoff
 * stat sits in the season strip right above; "Win the league" stays because
 * the sale stat beside it reads against it. The analysts live in the
 * keep-or-sell card below, so the card does not repeat them.
 */
export function forLeaguePage(found: TradeItem): TradeItem {
  return {
    ...found,
    kicker: "Worth trying",
    delivery: found.emailed_at ? found.delivery : { emailed: false },
    stats: found.stats.filter((x) => x.label !== "Playoffs"),
    voices: [],
  };
}
