/**
 * Season strip (in-season league hub header). The four facts a manager
 * checks first during the season: the week, the record and place, the
 * playoff and league-win chances, and whether trades are still open.
 *
 * Computes nothing. Odds come from the contend-or-sell verdict (the season
 * simulator canonical, `simulateSeason`), printed with the same `fmtPct`
 * the weekly email and /home use, so the three surfaces never disagree on
 * a number. The trade window comes from the `tradeWindow` canonical
 * carried on the verdict.
 */

import type { ContendOrSellVerdict } from "@/lib/strategy/verdict/compose";
import { fmtPct } from "@/lib/email/trade-desk/league-week";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export interface SeasonStripProps {
  week: number | null;
  standing: { rank: number; wins: number; losses: number; ties: number } | null;
  totalTeams: number | null;
  verdict: ContendOrSellVerdict | null;
}

export function SeasonStrip({ week, standing, totalTeams, verdict }: SeasonStripProps) {
  const odds = verdict?.odds ?? null;
  const tw = verdict?.trade_window ?? null;

  let tradeLine: string | null = null;
  if (tw) {
    if (tw.open) {
      tradeLine =
        tw.deadline_week != null
          ? week != null && week >= tw.deadline_week
            ? `Trades close after this week (week ${tw.deadline_week})`
            : `Trades open through week ${tw.deadline_week}`
          : "Trades open all season";
    } else if (tw.reason === "best_ball") {
      tradeLine = "Best ball: no trades or lineup moves";
    } else {
      tradeLine = `Trade deadline passed (week ${tw.deadline_week ?? "?"})`;
    }
  }

  const cells: Array<{ label: string; value: string; note?: string }> = [];
  if (standing) {
    const record = `${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ""}`;
    cells.push({
      label: "Record",
      value: record,
      note: totalTeams ? `${ordinal(standing.rank)} of ${totalTeams}` : undefined,
    });
  }
  if (odds) {
    cells.push({ label: "Playoffs", value: fmtPct(odds.playoff_pct) });
    cells.push({
      label: "Win the league",
      value: fmtPct(odds.title_pct),
      note: verdict ? `fair share is ${Math.round(verdict.league.fair_title_share * 100)}%` : undefined,
    });
  }
  if (tradeLine) cells.push({ label: "Trades", value: tw?.open ? "Open" : "Closed", note: tradeLine });

  if (cells.length === 0 && week == null) return null;

  return (
    <section
      aria-label="Your season"
      className="mt-6 rounded-lg border border-border-soft bg-surface px-4 py-4 sm:px-5"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {week != null ? `Week ${week} · ` : ""}Your season
      </div>
      {cells.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {cells.map((c) => (
            <div key={c.label} className="min-w-0">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="mt-0.5 font-mono text-xl text-foreground">{c.value}</dd>
              {c.note && <dd className="mt-0.5 text-xs text-muted">{c.note}</dd>}
            </div>
          ))}
        </dl>
      )}
      {odds && verdict && (
        <p className="mt-3 text-xs text-muted-2">
          {`Chances from ${verdict.provenance.sims.toLocaleString("en-US")} simulated seasons of this league, rerun with this season's scores.`}
        </p>
      )}
    </section>
  );
}
