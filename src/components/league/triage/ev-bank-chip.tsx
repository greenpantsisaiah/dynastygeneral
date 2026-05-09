/**
 * EV Bank chip for the triage hub. At-a-glance: your bank total +
 * league percentile + a 12-bar micro chart showing every roster's
 * relative position with confidence bands.
 *
 * Per founder feedback 2026-05-08: "the EV is cool but I want full
 * league EV so I can look at how I stand relatively." This is the
 * triage rendering; the full leaderboard with bigger bars + tooltips
 * lives on /team.
 *
 * Reads canonical LeagueEvBankReadout. No re-derivation.
 */

import Link from "next/link";
import type {
  LeagueEvBankReadout,
} from "@/lib/strategy/ev-bank";

export function EvBankChip({
  bank,
  href,
}: {
  bank: LeagueEvBankReadout;
  href: string;
}) {
  if (bank.ranked_count === 0) {
    return (
      <Link
        href={href}
        className="block rounded-lg border border-border-soft bg-surface px-4 py-3 hover:border-accent transition-colors"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          EV Bank
        </div>
        <p className="mt-1 text-[11px] text-muted-2">
          ADP / value data not yet resolved.
        </p>
      </Link>
    );
  }

  const me = bank.rosters.find((r) => r.is_me);
  const myEv = me?.total_ev ?? null;
  const myPct = bank.my_percentile;
  const myRank = bank.my_rank;
  const total = bank.ranked_count;

  // Micro chart: render each ranked roster as a horizontal bar.
  // Center axis at total_ev = 0; bars extend left for negative,
  // right for positive. Width proportional to abs(total_ev) /
  // max_abs across the league so bars stay scaled.
  const ranked = bank.rosters.filter((r) => r.total_ev != null);
  const maxAbs = Math.max(
    1,
    ...ranked.map((r) => Math.abs(r.total_ev ?? 0)),
  );

  const myEvDisplay =
    myEv != null
      ? myEv >= 0
        ? `+${myEv.toFixed(1)}`
        : myEv.toFixed(1)
      : null;
  const myEvColor =
    myEv == null
      ? "text-muted-2"
      : myEv >= 0
        ? "text-success"
        : "text-danger";

  return (
    <Link
      href={href}
      className="block rounded-lg border border-accent/40 bg-surface px-4 py-3 hover:border-accent transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          EV Bank
        </div>
        {myRank != null && (
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {myRank} of {total}
            {myPct != null && ` · ${Math.round(myPct)}th pct`}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <div className={`font-mono text-2xl font-semibold leading-none ${myEvColor}`}>
          {myEvDisplay ?? "ungraded"}
        </div>
        {bank.league_avg != null && (
          <div className="font-mono text-[10px] text-muted-2">
            league avg{" "}
            {bank.league_avg >= 0
              ? `+${bank.league_avg.toFixed(1)}`
              : bank.league_avg.toFixed(1)}
          </div>
        )}
      </div>

      {/* Micro chart: 12 bars stacked vertically, mine highlighted */}
      <div className="mt-3 space-y-0.5">
        {ranked.map((r) => {
          const widthPct = (Math.abs(r.total_ev ?? 0) / maxAbs) * 50;
          const isPositive = (r.total_ev ?? 0) >= 0;
          const barColor = r.is_me
            ? isPositive
              ? "bg-success"
              : "bg-danger"
            : "bg-foreground/30";
          return (
            <div
              key={r.roster_id}
              className="grid grid-cols-[1fr_2fr] items-center gap-2 text-[10px] leading-none"
            >
              <span
                className={`truncate text-right ${r.is_me ? "text-foreground font-semibold" : "text-muted-2"}`}
              >
                {r.is_me ? "You" : r.owner_name ?? `Roster ${r.roster_id}`}
              </span>
              <div className="relative h-2 rounded-full bg-border-soft/30">
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
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-snug text-muted-2">
        Tap to dig into the leaderboard, range envelopes, and per-pick
        breakdown.
      </p>
    </Link>
  );
}
