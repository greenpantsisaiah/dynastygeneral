/**
 * League trajectory chart (Visualization C). 5-year contender outlook
 * for every team. X-axis is season (2026..2030), Y-axis is contender
 * score (0-100). Tier band shading: <60 Rebuild, 60-75 Bubble, ≥75
 * Contender. User's line bolded; other teams dimmed.
 *
 * Replaces the prior 5-horizontal-bars Contender Outlook display.
 * Shows trajectory shape (rising / peaking / declining) AND league
 * context (where you sit relative to the field) in one chart.
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";
import {
  TIER_THRESHOLD_BUBBLE,
  TIER_THRESHOLD_CONTENDER,
} from "@/lib/strategy/contender-outlook/types";

const W = 720;
const H = 380;
const PAD_LEFT = 56;
const PAD_RIGHT = 80; // room for labels at the right edge
const PAD_TOP = 36;
const PAD_BOTTOM = 56;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function yFor(score: number): number {
  return PAD_TOP + (1 - Math.max(0, Math.min(100, score)) / 100) * PLOT_H;
}

function surnameOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].slice(0, 12);
}

export function LeagueTrajectory({ outlook }: { outlook: LeagueOutlook }) {
  // Pull seasons from the first team that has a forecast; teams should
  // share the same horizon.
  const teamWithForecast = outlook.teams.find((t) => t.forecast.length > 0);
  if (!teamWithForecast) {
    return (
      <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Contender outlook · 5 years
        </div>
        <p className="mt-2 text-sm text-muted">
          No forecast yet (anchors below the threshold). Comes online
          once the league has enough draft data.
        </p>
      </section>
    );
  }
  const seasons = teamWithForecast.forecast.map((y) => y.season);
  const xFor = (idx: number): number =>
    PAD_LEFT + (idx / Math.max(1, seasons.length - 1)) * PLOT_W;
  const me = outlook.teams.find((t) => t.is_me);

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Contender outlook · 5 years
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            League trajectories
          </h2>
        </div>
        <div className="text-xs text-muted">
          {me
            ? `Your peak: ${me.peak_year} · score ${me.peak_score} · ${me.peak_tier}`
            : ""}
        </div>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Each team's projected contender score across seasons. Shaded
        bands = tier thresholds (Rebuild &lt;60, Bubble 60-74, Contender
        ≥75). Your line is the gold one.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label="Contender outlook trajectory chart"
      >
        {/* Tier band backgrounds */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={PLOT_W}
          height={yFor(TIER_THRESHOLD_BUBBLE) - PAD_TOP}
          fill="rgba(245, 158, 11, 0.06)"
        />
        <rect
          x={PAD_LEFT}
          y={yFor(TIER_THRESHOLD_BUBBLE)}
          width={PLOT_W}
          height={yFor(TIER_THRESHOLD_CONTENDER) - yFor(TIER_THRESHOLD_BUBBLE)}
          fill="rgba(245, 158, 11, 0.03)"
        />

        {/* Tier threshold lines */}
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + PLOT_W}
          y1={yFor(TIER_THRESHOLD_BUBBLE)}
          y2={yFor(TIER_THRESHOLD_BUBBLE)}
          stroke="rgba(255,255,255,0.10)"
          strokeDasharray="3 4"
        />
        <line
          x1={PAD_LEFT}
          x2={PAD_LEFT + PLOT_W}
          y1={yFor(TIER_THRESHOLD_CONTENDER)}
          y2={yFor(TIER_THRESHOLD_CONTENDER)}
          stroke="rgba(255,255,255,0.14)"
          strokeDasharray="3 4"
        />
        <text
          x={PAD_LEFT + PLOT_W + 8}
          y={yFor(TIER_THRESHOLD_BUBBLE) + 3}
          fill="currentColor"
          fontSize={9}
          opacity={0.5}
        >
          Bubble {TIER_THRESHOLD_BUBBLE}
        </text>
        <text
          x={PAD_LEFT + PLOT_W + 8}
          y={yFor(TIER_THRESHOLD_CONTENDER) + 3}
          fill="currentColor"
          fontSize={9}
          opacity={0.5}
        >
          Contender {TIER_THRESHOLD_CONTENDER}
        </text>

        {/* X-axis season ticks */}
        {seasons.map((s, i) => (
          <g key={s}>
            <line
              x1={xFor(i)}
              x2={xFor(i)}
              y1={PAD_TOP + PLOT_H}
              y2={PAD_TOP + PLOT_H + 4}
              stroke="rgba(255,255,255,0.25)"
            />
            <text
              x={xFor(i)}
              y={PAD_TOP + PLOT_H + 18}
              textAnchor="middle"
              fill="currentColor"
              fontSize={11}
              opacity={0.6}
            >
              {s}
            </text>
          </g>
        ))}

        {/* Y-axis ticks */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <text
              x={PAD_LEFT - 8}
              y={yFor(v) + 3}
              textAnchor="end"
              fill="currentColor"
              fontSize={9}
              opacity={0.4}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Lines per team. Render non-me first so user's line is on top. */}
        {outlook.teams
          .slice()
          .sort((a, b) => Number(a.is_me) - Number(b.is_me))
          .map((t) => {
            if (t.forecast.length === 0) return null;
            const path = t.forecast
              .map((y, i) => {
                const cmd = i === 0 ? "M" : "L";
                return `${cmd} ${xFor(i)} ${yFor(y.score)}`;
              })
              .join(" ");
            const stroke = t.is_me ? "#f59e0b" : "rgba(255,255,255,0.18)";
            const strokeWidth = t.is_me ? 2.5 : 1;
            return (
              <g key={t.roster_id}>
                <path
                  d={path}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinejoin="round"
                />
                {/* End-of-line label */}
                <text
                  x={xFor(t.forecast.length - 1) + 6}
                  y={yFor(t.forecast[t.forecast.length - 1].score) + 3}
                  fill={t.is_me ? "#f59e0b" : "currentColor"}
                  fontSize={t.is_me ? 11 : 9}
                  fontWeight={t.is_me ? 600 : 400}
                  opacity={t.is_me ? 1 : 0.5}
                >
                  {surnameOf(t.owner_name)}
                </text>
              </g>
            );
          })}
      </svg>
    </section>
  );
}
