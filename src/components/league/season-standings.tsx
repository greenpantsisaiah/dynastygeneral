/**
 * In-season standings. Sleeper's record and points for, in Sleeper's
 * order, with each team's chance to make the playoffs and to win the
 * league from the same simulator run the season strip and the keep-or-sell
 * card read (`verdict.league_odds`, the `simulateSeason` canonical),
 * printed with the shared `fmtPct`. Computes nothing.
 */

import type { TeamOdds } from "@/lib/strategy/verdict/season-sim";
import { fmtPct, playoffRange, RANGE_LABEL, ROLE_DEFINITIONS } from "@/lib/email/trade-desk/league-week";

export interface SeasonStandingsRow {
  roster_id: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  is_me: boolean;
}

export function SeasonStandings({
  rows,
  odds,
  sims,
  medianGames,
  showSellers,
}: {
  rows: SeasonStandingsRow[];
  odds: Record<number, TeamOdds> | null;
  sims: number | null;
  /** league_average_match: each week also counts a game against the league median. */
  medianGames: boolean;
  /** Seller tags: only while trades are open (tradeWindow canonical) and
   * only where rosters carry over (a redraft sale banks nothing). */
  showSellers: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Standings" className="rounded-lg border border-border-soft bg-surface px-4 py-4 sm:px-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">Standings</div>
      <table className="mt-3 w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="w-5 pb-2 font-normal sm:w-8">#</th>
            <th className="pb-2 font-normal">Team</th>
            <th className="w-[48px] pb-2 text-right font-normal sm:w-24">Record</th>
            <th className="hidden w-28 pb-2 text-right font-normal sm:table-cell">Points for</th>
            {odds && <th className="w-[60px] pb-2 text-right font-normal sm:w-24">Playoffs</th>}
            {odds && <th className="w-[56px] pb-2 text-right font-normal leading-tight sm:w-28">Win league</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const o = odds?.[r.roster_id];
            return (
              <tr
                key={r.roster_id}
                className={`border-t border-border-soft ${r.is_me ? "bg-accent/5 font-semibold text-foreground" : "text-muted"}`}
              >
                <td className="py-2 font-mono text-xs">{i + 1}</td>
                <td className="min-w-0 py-2 pr-2">
                  <span className="block break-words">{r.name}</span>
                  {r.is_me && !o && <span className="block text-xs font-normal text-accent">You</span>}
                  {o && (
                    <span className="block text-xs font-normal leading-snug text-muted-2">
                      {r.is_me && <span className="text-accent">You · </span>}
                      {RANGE_LABEL[playoffRange(o.playoff_pct)]}
                      {/* Same rule as the weekly email's Seller tag
                          (ROLE_DEFINITIONS.seller): a long shot or out,
                          likely to sell veterans. */}
                      {showSellers && !r.is_me && ["long_shot", "no_chance"].includes(playoffRange(o.playoff_pct))
                        ? " · seller"
                        : ""}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono">
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ""}
                </td>
                <td className="hidden py-2 text-right font-mono sm:table-cell">{r.fpts.toFixed(1)}</td>
                {odds && <td className="py-2 text-right font-mono">{o ? fmtPct(o.playoff_pct) : "n/a"}</td>}
                {odds && <td className="py-2 text-right font-mono">{o ? fmtPct(o.title_pct) : "n/a"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-2">
        {medianGames
          ? "Records are Sleeper's and include a game against the league median each week. "
          : "Records are Sleeper's. "}
        {odds ? "Favorite, In the hunt, Bubble, Long shot, No chance: each team's playoff outlook. " : ""}
        {odds && showSellers ? `${ROLE_DEFINITIONS.seller}. ` : ""}
        {odds && sims
          ? `Chances from ${sims.toLocaleString("en-US")} simulated seasons of this league's remaining schedule${medianGames ? ", median games included" : ""}.`
          : ""}
      </p>
    </section>
  );
}
