/**
 * Divergence from League Mean. For each team, two horizontal bars
 * showing how their win-now and future scores diverge from the league
 * mean. Bars left of zero = below average, right = above. User's bars
 * in accent gold.
 *
 * The point: when absolute scores cluster (everyone 75-90), abs values
 * obscure differentiation. Centering on league mean makes a +3 vs -2
 * pop visually even though both are within 5 points of average.
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";

export function LeagueDivergence({
  outlook,
}: {
  outlook: LeagueOutlook;
}) {
  const meanWinNow =
    outlook.teams.reduce((s, t) => s + t.win_now, 0) /
    Math.max(1, outlook.teams.length);
  const meanFuture =
    outlook.teams.reduce((s, t) => s + t.future, 0) /
    Math.max(1, outlook.teams.length);

  // Find max absolute deviation across both axes for consistent scale.
  const maxDev = Math.max(
    1,
    ...outlook.teams.flatMap((t) => [
      Math.abs(t.win_now - meanWinNow),
      Math.abs(t.future - meanFuture),
    ]),
  );

  const sorted = [...outlook.teams].sort(
    (a, b) =>
      b.win_now + b.future - (a.win_now + a.future),
  );

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Divergence from league mean
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          Above or below the field
        </h2>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Each team's win-now and future centered on the league mean
        (win-now {meanWinNow.toFixed(1)}, future {meanFuture.toFixed(1)}).
        Bars left of center = below average; right = above. Surfaces
        small absolute differences as visible spatial divergence.
      </p>
      <div className="mt-4 space-y-3">
        {sorted.map((t) => {
          const devNow = t.win_now - meanWinNow;
          const devFut = t.future - meanFuture;
          return (
            <div
              key={t.roster_id}
              className={`grid grid-cols-[120px_1fr_1fr] items-center gap-3 rounded-sm px-2 py-1.5 ${
                t.is_me ? "bg-accent/5" : ""
              }`}
            >
              <div
                className={`truncate text-sm ${
                  t.is_me ? "font-semibold text-accent" : "text-foreground"
                }`}
              >
                {t.is_me && <span className="mr-1">▸</span>}
                {t.owner_name ?? "?"}
              </div>
              <DivergenceBar
                label="now"
                value={devNow}
                maxDev={maxDev}
                isMe={t.is_me}
                rawValue={t.win_now}
              />
              <DivergenceBar
                label="future"
                value={devFut}
                maxDev={maxDev}
                isMe={t.is_me}
                rawValue={t.future}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DivergenceBar({
  label,
  value,
  maxDev,
  isMe,
  rawValue,
}: {
  label: string;
  value: number;
  maxDev: number;
  isMe: boolean;
  rawValue: number;
}) {
  const pct = (Math.abs(value) / maxDev) * 50; // 0-50%, fills half-track max
  const isPos = value >= 0;
  return (
    <div className="relative h-5 rounded-sm bg-surface-2">
      {/* Center line */}
      <div className="absolute left-1/2 top-0 h-full w-px bg-border-strong" />
      {/* Bar */}
      <div
        className={`absolute top-0 h-full ${
          isMe ? "bg-accent" : isPos ? "bg-success/60" : "bg-danger/60"
        }`}
        style={{
          left: isPos ? "50%" : `${50 - pct}%`,
          width: `${pct}%`,
        }}
      />
      {/* Numeric labels */}
      <div className="pointer-events-none absolute inset-0 flex items-center px-2 font-mono text-[10px]">
        <span className="text-muted-2">{label}</span>
        <span
          className={`ml-auto ${
            isMe
              ? "text-accent font-semibold"
              : isPos
                ? "text-success"
                : "text-danger"
          }`}
        >
          {isPos ? "+" : ""}
          {value.toFixed(1)} ({rawValue})
        </span>
      </div>
    </div>
  );
}
