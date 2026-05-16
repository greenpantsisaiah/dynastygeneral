/**
 * Future Pick Cabinet. Surfaces the user's owned future draft picks
 * as a first-class roster asset, broken out by season and round.
 *
 * For rosters in a TEARDOWN or REBUILDER posture, this is often their
 * single most valuable asset. The hub historically only showed current
 * roster players; pick capital was buried in the snapshot data.
 *
 * Per founder direction 2026-05-16: a teardown-rebuilder roster that
 * owns 3x 2027 R1s should see those picks at the top of "Your team",
 * not invisible.
 */

import type { FutureCapitalSummary } from "@/lib/strategy/posture/types";

const SEASON_TONE = [
  "text-success",
  "text-accent",
  "text-warning",
  "text-muted-2",
];

export function FuturePickCabinet({
  capital,
}: {
  capital: FutureCapitalSummary;
}) {
  const seasons = Object.keys(capital.by_season).sort();
  if (seasons.length === 0) return null;

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Future pick cabinet
          </div>
          <p className="mt-1 text-xs text-muted">
            Draft picks you own in future rookie drafts. Year-decayed
            and format-multiplied; 2027 picks carry a class-strength
            premium (the 2027 rookie class is widely perceived stronger
            than 2026).
          </p>
        </div>
        {capital.league_rank != null && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2"
            title="Your league rank for total future capital, summed across the 5-year horizon. 1 = the most pick capital in the league."
          >
            league rank ·{" "}
            <span className="text-foreground">
              {capital.league_rank} of {capital.rank_total}
            </span>
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {seasons.map((season, idx) => {
          const counts = capital.by_season[season];
          const tone = SEASON_TONE[idx % SEASON_TONE.length];
          return (
            <SeasonCard
              key={season}
              season={season}
              counts={counts}
              tone={tone}
            />
          );
        })}
      </div>

      <div className="mt-3 font-mono text-[10px] text-muted-2">
        Total future capital value ·{" "}
        <span className="text-foreground">
          {Math.round(capital.total_value)}
        </span>
        <span
          className="ml-2 text-muted-2"
          title="Year decay: +1 yr = 1.00x, +2 yr = 0.80x, +3 yr = 0.60x, +4 yr = 0.45x, +5 yr = 0.32x. Class strength: 2027 = 1.10x (strong class), 2026 = 0.95x."
        >
          (year-decayed, class-adjusted, format-multiplied)
        </span>
      </div>
    </section>
  );
}

function SeasonCard({
  season,
  counts,
  tone,
}: {
  season: string;
  counts: { round_1: number; round_2: number; round_3: number; round_4_plus: number };
  tone: string;
}) {
  const total =
    counts.round_1 +
    counts.round_2 +
    counts.round_3 +
    counts.round_4_plus;
  return (
    <div className="rounded-md border border-border-soft bg-surface-2 px-3 py-3">
      <div className="flex items-baseline justify-between">
        <div className={`font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${tone}`}>
          {season}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {total} pick{total === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        <PickPill round="R1" count={counts.round_1} accent />
        <PickPill round="R2" count={counts.round_2} />
        <PickPill round="R3" count={counts.round_3} />
        <PickPill round="R4+" count={counts.round_4_plus} />
      </div>
    </div>
  );
}

function PickPill({
  round,
  count,
  accent = false,
}: {
  round: string;
  count: number;
  accent?: boolean;
}) {
  const isZero = count === 0;
  return (
    <div
      className={`rounded-sm border px-1 py-1 ${
        isZero
          ? "border-border-soft bg-transparent"
          : accent
            ? "border-accent/60 bg-accent/10"
            : "border-border-strong bg-surface"
      }`}
    >
      <div
        className={`font-mono text-[8px] uppercase tracking-[0.14em] ${
          isZero ? "text-muted-2" : accent ? "text-accent" : "text-muted-2"
        }`}
      >
        {round}
      </div>
      <div
        className={`mt-0.5 font-mono text-sm font-semibold ${
          isZero ? "text-muted-2" : "text-foreground"
        }`}
      >
        {count}
      </div>
    </div>
  );
}
