/**
 * Full league EV bank leaderboard. Lives on /team. The deep version
 * of the at-a-glance chip on the triage hub.
 *
 * Per founder feedback 2026-05-08: "I want the full league EV (micro
 * chart) so I can look at how I stand relatively." Confidence bands
 * surface on Sloan-mode-equivalent for now (always visible inline
 * via a small range note next to each bar).
 *
 * Reads canonical LeagueEvBankReadout. No re-derivation.
 */

import type { LeagueEvBankReadout } from "@/lib/strategy/ev-bank";

export function LeagueEvBankLeaderboard({
  bank,
}: {
  bank: LeagueEvBankReadout;
}) {
  if (bank.ranked_count === 0) {
    return (
      <section className="mt-8 rounded-lg border-2 border-border-soft px-5 py-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-2">
          League EV bank
        </div>
        <p className="mt-2 text-sm text-muted">
          ADP / value data not yet resolved for this league. The
          leaderboard will populate once the engine has resolved both
          axes for at least one pick.
        </p>
      </section>
    );
  }

  const ranked = bank.rosters.filter((r) => r.total_ev != null);
  const maxAbs = Math.max(
    1,
    ...ranked.map((r) => Math.abs(r.total_ev ?? 0)),
  );

  return (
    <section className="mt-8 rounded-lg border-2 border-accent/40 px-5 py-6">
      <header className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            League EV bank
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            How you stand, relatively.
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 text-right">
          {bank.my_rank != null && (
            <div>
              You: {bank.my_rank} of {bank.ranked_count}
            </div>
          )}
          {bank.my_percentile != null && (
            <div>{Math.round(bank.my_percentile)}th pct</div>
          )}
          {bank.league_avg != null && (
            <div className="mt-1">
              league avg{" "}
              {bank.league_avg >= 0
                ? `+${bank.league_avg.toFixed(1)}`
                : bank.league_avg.toFixed(1)}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-2">
        {ranked.map((r, i) => {
          const total = r.total_ev ?? 0;
          const widthPct = (Math.abs(total) / maxAbs) * 50;
          const isPositive = total >= 0;
          const barColor = r.is_me
            ? isPositive
              ? "bg-success"
              : "bg-danger"
            : isPositive
              ? "bg-success/40"
              : "bg-danger/40";
          const rangeText =
            r.range_low != null && r.range_high != null
              ? `range ${
                  r.range_low >= 0
                    ? `+${r.range_low.toFixed(1)}`
                    : r.range_low.toFixed(1)
                } to ${
                  r.range_high >= 0
                    ? `+${r.range_high.toFixed(1)}`
                    : r.range_high.toFixed(1)
                }`
              : null;
          return (
            <div
              key={r.roster_id}
              className={`grid grid-cols-[120px_1fr_70px] items-center gap-3 text-[12px] leading-tight ${
                r.is_me
                  ? "rounded-md bg-accent/5 px-2 py-1 -mx-2"
                  : ""
              }`}
            >
              <div className="truncate">
                <div
                  className={r.is_me ? "text-foreground font-semibold" : "text-foreground"}
                >
                  {r.is_me
                    ? "You"
                    : r.owner_name ?? `Roster ${r.roster_id}`}
                </div>
                <div className="font-mono text-[9px] text-muted-2">
                  rank {i + 1} · {r.resolved_picks}/{r.total_picks} resolved
                </div>
              </div>
              <div className="relative h-3 rounded-full bg-border-soft/30">
                <div
                  className="absolute left-1/2 top-0 h-full w-px bg-border-strong"
                  aria-hidden="true"
                />
                <div
                  className={`absolute top-0 h-full rounded-full ${barColor}`}
                  style={{
                    width: `${widthPct}%`,
                    [isPositive ? "left" : "right"]: "50%",
                  }}
                />
              </div>
              <div
                className={`font-mono text-right ${
                  isPositive ? "text-success" : "text-danger"
                }`}
              >
                {isPositive ? "+" : ""}
                {total.toFixed(1)}
              </div>
              {rangeText && (
                <div className="col-span-3 font-mono text-[9px] text-muted-2 pl-[120px]">
                  {rangeText}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-2">
        EV per pick = (value/100) × (pick − ADP). Range from realistic
        ADP noise of ±{ranked[0]?.range_low != null ? "3" : "n/a"} picks.
        Sharp locks (player taken before ADP) count negative against
        the bank by definition; the math is honest about that across
        every roster.
      </p>
    </section>
  );
}
