/**
 * League scatter (Visualization B). Win-now (x) vs future (y) for
 * every team in the league. User's roster highlighted. Tier bands
 * shown as light grid: <60 = Rebuild quadrant background, 60-75 =
 * Bubble band, ≥75 = Contender band.
 *
 * The chart shows that win-now and future are NOT zero-sum: a
 * roster can land in the upper-right (high both) when the engine's
 * age curve recognizes young + proven cores. Per founder analysis
 * 2026-04-26: replaces the prior two-big-numbers presentation that
 * couldn't show roster shape diversity at a glance.
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";

const W = 720;
const H = 460;
const PAD_LEFT = 56;
const PAD_RIGHT = 24;
const PAD_TOP = 36;
const PAD_BOTTOM = 56;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function xFor(score: number): number {
  return PAD_LEFT + (Math.max(0, Math.min(100, score)) / 100) * PLOT_W;
}
function yFor(score: number): number {
  return PAD_TOP + (1 - Math.max(0, Math.min(100, score)) / 100) * PLOT_H;
}

function surnameOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].slice(0, 12);
}

export function LeagueScatter({ outlook }: { outlook: LeagueOutlook }) {
  const me = outlook.teams.find((t) => t.is_me);
  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            League shape
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Win-now vs future
          </h2>
        </div>
        <div className="text-xs text-muted">
          {me
            ? `Your roster: ${me.win_now} now · ${me.future} future`
            : "Your roster not identified"}
        </div>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Every team plotted by current win-now (horizontal) and future
        (vertical). Top-right is contender shape (high both); top-left is
        future-build; bottom-right is win-now-only; bottom-left is rebuild.
        Your roster is the bright dot.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Win-now vs future scatter chart, all teams"
      >
        {/* Tier band backgrounds */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={PLOT_W}
          height={PLOT_H}
          fill="var(--color-surface-2, #0f1115)"
        />
        {/* Contender quadrant (high win-now AND high future) */}
        <rect
          x={xFor(75)}
          y={yFor(100)}
          width={xFor(100) - xFor(75)}
          height={yFor(75) - yFor(100)}
          fill="rgba(245, 158, 11, 0.10)"
        />
        {/* Threshold lines */}
        <line
          x1={xFor(60)}
          x2={xFor(60)}
          y1={PAD_TOP}
          y2={PAD_TOP + PLOT_H}
          stroke="rgba(255,255,255,0.08)"
          strokeDasharray="3 4"
        />
        <line
          x1={xFor(75)}
          x2={xFor(75)}
          y1={PAD_TOP}
          y2={PAD_TOP + PLOT_H}
          stroke="rgba(255,255,255,0.10)"
          strokeDasharray="3 4"
        />
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + PLOT_W}
          y1={yFor(60)}
          y2={yFor(60)}
          stroke="rgba(255,255,255,0.08)"
          strokeDasharray="3 4"
        />
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + PLOT_W}
          y1={yFor(75)}
          y2={yFor(75)}
          stroke="rgba(255,255,255,0.10)"
          strokeDasharray="3 4"
        />

        {/* Axes labels */}
        <text
          x={PAD_LEFT + PLOT_W / 2}
          y={H - 14}
          textAnchor="middle"
          className="fill-current"
          fill="currentColor"
          fontSize={11}
          opacity={0.6}
        >
          WIN-NOW →
        </text>
        <text
          x={16}
          y={PAD_TOP + PLOT_H / 2}
          textAnchor="middle"
          fill="currentColor"
          fontSize={11}
          opacity={0.6}
          transform={`rotate(-90, 16, ${PAD_TOP + PLOT_H / 2})`}
        >
          ↑ FUTURE
        </text>

        {/* Tier band labels (top-right corner annotations) */}
        <text
          x={xFor(87.5)}
          y={yFor(87.5)}
          textAnchor="middle"
          fill="#f59e0b"
          fontSize={10}
          opacity={0.6}
        >
          CONTENDER
        </text>
        <text
          x={xFor(40)}
          y={yFor(20)}
          textAnchor="middle"
          fill="currentColor"
          fontSize={10}
          opacity={0.35}
        >
          rebuild
        </text>

        {/* League median crosshair */}
        <circle
          cx={xFor(outlook.median_win_now)}
          cy={yFor(outlook.median_future)}
          r={4}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
        <text
          x={xFor(outlook.median_win_now) + 6}
          y={yFor(outlook.median_future) - 6}
          fill="currentColor"
          fontSize={9}
          opacity={0.4}
        >
          median
        </text>

        {/* Team dots. Only label the user prominently to avoid label
            collision when teams cluster. The detail table below names
            every team with raw numbers; the chart's job is to show
            spatial position at a glance, not to be a labeled directory. */}
        {outlook.teams.map((t) => {
          const cx = xFor(t.win_now);
          const cy = yFor(t.future);
          const r = t.is_me ? 9 : 4;
          const fill = t.is_me ? "#f59e0b" : "rgba(255,255,255,0.40)";
          return (
            <g key={t.roster_id}>
              {t.is_me && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 4}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              )}
              <circle cx={cx} cy={cy} r={r} fill={fill} />
            </g>
          );
        })}

        {/* User label, rendered last + with a subtle backdrop so it
            sits cleanly above any nearby dots. */}
        {(() => {
          const me = outlook.teams.find((t) => t.is_me);
          if (!me) return null;
          const cx = xFor(me.win_now);
          const cy = yFor(me.future);
          const text = `${surnameOf(me.owner_name)} (${me.win_now} / ${me.future})`;
          const labelX = cx + 14;
          const labelY = cy + 4;
          // Approx label width for a backdrop pill so the text reads
          // even on top of other dots.
          const w = text.length * 6 + 10;
          return (
            <g>
              <rect
                x={labelX - 4}
                y={labelY - 11}
                width={w}
                height={16}
                rx={3}
                fill="#0a0a0a"
                opacity={0.75}
              />
              <text
                x={labelX}
                y={labelY}
                fill="#f59e0b"
                fontSize={11}
                fontWeight={700}
              >
                {text}
              </text>
            </g>
          );
        })()}
      </svg>
    </section>
  );
}
