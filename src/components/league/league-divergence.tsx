/**
 * League Standings (win-now + future). Renders teams sorted by win-now
 * score with explicit ordinal rank, contender tier label, and bars
 * scaled to the actual league range so differentiation is visible to
 * a casual reader.
 *
 * Founder feedback 2026-04-29: prior divergence-from-mean visualization
 * compressed small differences and did not lead the eye to the
 * contender hierarchy. New view: sorted-by-win-now ranked rows with
 * absolute-score bars + tier labels (CONTENDER / IN THE MIX / LONG
 * SHOT). Eye reads the standings in two seconds.
 *
 * Future score still shown as a secondary axis per row so the user
 * can spot teams whose now-strength is propped up by aging assets vs
 * teams whose future hedges their now.
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";
import { tierForLeagueRank } from "@/lib/strategy/league-outlook/rank-tier";

type TeamRow = LeagueOutlook["teams"][number];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function LeagueDivergence({
  outlook,
}: {
  outlook: LeagueOutlook;
}) {
  const teams = outlook.teams;
  const meanWinNow =
    teams.reduce((s, t) => s + t.win_now, 0) / Math.max(1, teams.length);
  const meanFuture =
    teams.reduce((s, t) => s + t.future, 0) / Math.max(1, teams.length);

  // Score range across the league. Bars scale to this range so the
  // visual gap between best and worst is real, not compressed by an
  // arbitrary 0-100 fill.
  const allScores = [
    ...teams.map((t) => t.win_now),
    ...teams.map((t) => t.future),
  ];
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const scoreRange = Math.max(1, maxScore - minScore);

  // Sort by win-now (the headline view).
  const ranked = [...teams].sort((a, b) => b.win_now - a.win_now);
  // Per-team future rank for the secondary label.
  const byFuture = [...teams].sort((a, b) => b.future - a.future);
  const futureRankById = new Map<number, number>();
  byFuture.forEach((t, idx) => futureRankById.set(t.roster_id, idx + 1));

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          League standings · win-now + future
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          Who is the team to beat?
        </h2>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Sorted by 2026 win-now strength. Tier label reflects win-now
        contender odds; future column shows multi-year value separately
        so a "Contender now" with weak future reads as the team to beat
        this season but a sell-window candidate. League means: now{" "}
        {meanWinNow.toFixed(1)}, future {meanFuture.toFixed(1)}.
      </p>
      <div className="mt-4 space-y-2">
        {ranked.map((t, idx) => {
          const rank = idx + 1;
          const tier = tierForLeagueRank(rank, teams.length);
          const futureRank =
            futureRankById.get(t.roster_id) ?? teams.length;
          return (
            <div
              key={t.roster_id}
              className={`grid grid-cols-[28px_140px_72px_1fr_72px_1fr] items-center gap-2 rounded-sm px-2 py-1.5 ${
                t.is_me ? "bg-accent/5" : ""
              }`}
            >
              <div
                className={`font-mono text-[11px] uppercase tracking-[0.14em] ${
                  rank === 1 ? "text-accent" : "text-muted-2"
                }`}
              >
                {ordinal(rank)}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div
                  className={`truncate text-sm ${
                    t.is_me ? "font-semibold text-accent" : "text-foreground"
                  }`}
                >
                  {t.is_me && <span className="mr-1">▸</span>}
                  {t.owner_name ?? "?"}
                </div>
                <TierBadge tone={tier.tone} label={tier.label} />
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                Now {t.win_now}
              </div>
              <ScoreBar
                value={t.win_now}
                min={minScore}
                max={maxScore}
                range={scoreRange}
                isMe={t.is_me}
                tone="now"
              />
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                Future {t.future} · {ordinal(futureRank)}
              </div>
              <ScoreBar
                value={t.future}
                min={minScore}
                max={maxScore}
                range={scoreRange}
                isMe={t.is_me}
                tone="future"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TierBadge({
  tone,
  label,
}: {
  tone: "contender" | "mix" | "longshot";
  label: string;
}) {
  const cls =
    tone === "contender"
      ? "border-accent/60 bg-accent/15 text-accent"
      : tone === "mix"
        ? "border-success/40 bg-success/10 text-success"
        : "border-border-soft bg-surface-2 text-muted-2";
  return (
    <span
      className={`inline-flex w-fit rounded-sm border px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em] ${cls}`}
    >
      {label}
    </span>
  );
}

function ScoreBar({
  value,
  min,
  max: _max,
  range,
  isMe,
  tone,
}: {
  value: number;
  min: number;
  max: number;
  range: number;
  isMe: boolean;
  tone: "now" | "future";
}) {
  // Bar fill maps absolute score onto the league range. Best-in-league
  // pegs at 100% width; worst pegs near 0%.
  const pct = Math.max(2, Math.min(100, ((value - min) / range) * 100));
  return (
    <div className="relative h-4 rounded-sm bg-surface-2">
      <div
        className={`absolute left-0 top-0 h-full rounded-sm ${
          isMe
            ? "bg-accent"
            : tone === "now"
              ? "bg-success/60"
              : "bg-success/30"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Re-export the prior name in case anything else imports it.
export { LeagueDivergence as LeagueStandings };
