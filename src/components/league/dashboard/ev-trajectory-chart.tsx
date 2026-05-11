"use client";

/**
 * EV Bank trajectory chart. The hero visualization for "Your EV"
 * (Box 1 of the EV bank 3-box row).
 *
 * Per founder direction 2026-05-08 PM (538-editor pass):
 *   "Sexy charts and graphs, not just text. Sparklines, tables, etc,
 *    with great hover functionality."
 *
 * Stock-chart shape: cumulative EV banked over picks. Each pick is a
 * node on the line. Confidence ribbon shaded around the line as a
 * translucent fan. Hover a node: full per-pick detail tooltip.
 *
 * MIT-grade statistical floor (principle 0): every number carries
 * its CI inline. Range envelope from realistic ADP noise is the
 * confidence band visualized.
 *
 * Reads canonical EvBank shape. No re-derivation.
 */

import { useMemo, useState } from "react";
import type { EvBank, EvBankPickEntry } from "@/lib/strategy/ev-bank";
import type { LeagueEvBankReadout } from "@/lib/strategy/ev-bank/league";

export type EvTrajectoryChartProps = {
  bank: EvBank;
  // Optional league context for the overlay reference line + header
  // comparison ("league avg +12.4 · you rank 1 of 12 (100th pct)").
  // When provided and at least 2 rosters have resolved totals, the
  // chart renders a faint horizontal line at the league average and
  // adds a one-line comparison summary above the plot.
  leagueBank?: LeagueEvBankReadout | null;
};

export function EvTrajectoryChart({ bank, leagueBank }: EvTrajectoryChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const trajectory = useMemo(() => buildTrajectory(bank), [bank]);

  if (trajectory.points.length === 0) {
    return (
      <div className="px-5 py-4 border-t border-border-soft">
        <p className="text-xs text-muted-2">
          ADP / value not yet resolved for your picks. Trajectory will render once at least one entry resolves.
        </p>
      </div>
    );
  }

  const totalEv = bank.total_ev;
  const totalDisplay =
    totalEv == null
      ? "ungraded"
      : totalEv >= 0
        ? `+${totalEv.toFixed(1)}`
        : totalEv.toFixed(1);
  const totalColor =
    totalEv == null
      ? "text-foreground"
      : totalEv >= 5
        ? "text-success"
        : totalEv >= -5
          ? "text-foreground"
          : totalEv >= -15
            ? "text-warning"
            : "text-danger";

  const ciText =
    bank.range_low != null && bank.range_high != null
      ? `${bank.range_low >= 0 ? "+" : ""}${bank.range_low.toFixed(1)} to ${bank.range_high >= 0 ? "+" : ""}${bank.range_high.toFixed(1)}`
      : null;

  const hovered =
    hoveredIdx != null ? trajectory.points[hoveredIdx] : null;

  const leagueAvg =
    leagueBank && leagueBank.ranked_count >= 2 ? leagueBank.league_avg : null;
  const leagueCompareLine = leagueBank
    ? buildLeagueCompareLine(leagueBank)
    : null;

  return (
    <div className="px-5 py-5 border-t border-border-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Your EV bank
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`font-mono text-3xl font-semibold leading-none ${totalColor}`}>
              {totalDisplay}
            </span>
            {ciText && (
              <span className="font-mono text-[11px] text-muted-2">
                CI {ciText}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-2">
            Cumulative EV banked across {trajectory.points.length} picks.{" "}
            {bank.entries.length - trajectory.points.length > 0 && (
              <>
                {bank.entries.length - trajectory.points.length} unresolved (no ADP / value).
              </>
            )}
          </p>
          {leagueCompareLine && (
            <p className="mt-1 font-mono text-[10px] text-muted-2">
              {leagueCompareLine}
            </p>
          )}
        </div>
        <SparklineSummary points={trajectory.points} />
      </div>

      <div className="mt-4">
        <TrajectorySvg
          trajectory={trajectory}
          hoveredIdx={hoveredIdx}
          onHover={setHoveredIdx}
          leagueAvg={leagueAvg}
        />
      </div>

      {hovered ? (
        <HoveredNodeTooltip entry={hovered.entry} cumulative={hovered.cumulative} />
      ) : (
        <p className="mt-3 text-[11px] text-muted-2">
          Hover a pick to see its individual EV contribution. Confidence
          ribbon shows the +/- 3-pick ADP-noise envelope around the
          running total.
        </p>
      )}
    </div>
  );
}

/* ============================================================
 * Math: cumulative trajectory + confidence ribbon
 * ============================================================ */

type TrajectoryPoint = {
  idx: number;
  pickLabel: string;
  pickNo: number;
  entry: EvBankPickEntry & { ev_delta: number };
  cumulative: number;
  cumulativeLow: number;
  cumulativeHigh: number;
};

type Trajectory = {
  points: TrajectoryPoint[];
  yMin: number;
  yMax: number;
};

function buildTrajectory(bank: EvBank): Trajectory {
  const noise = bank.adp_noise_picks;
  // Resolved entries only (with ev_delta). Sorted by pick_no.
  const resolved = bank.entries
    .filter(
      (e): e is EvBankPickEntry & { ev_delta: number; adp: number; value: number } =>
        e.ev_delta != null && e.adp != null && e.value != null,
    )
    .sort((a, b) => a.pick_no - b.pick_no);

  let cum = 0;
  const points: TrajectoryPoint[] = resolved.map((entry, idx) => {
    cum += entry.ev_delta;
    // Cumulative confidence band: each pick's ev contribution under
    // shifted ADP. Width per pick scales with value/100 * noise * 2
    // (noise is one-sided). Sum widths up to the current pick gives
    // the cumulative band half-width.
    let lowSum = 0;
    let highSum = 0;
    for (let j = 0; j <= idx; j++) {
      const e = resolved[j];
      const valueWeight = e.value / 100;
      // Shift ADP +noise → cumulative shrinks (worst case). Shift -noise → grows.
      lowSum += valueWeight * (e.pick_no - (e.adp + noise));
      highSum += valueWeight * (e.pick_no - (e.adp - noise));
    }
    return {
      idx,
      pickLabel: entry.pick_label,
      pickNo: entry.pick_no,
      entry,
      cumulative: round2(cum),
      cumulativeLow: round2(lowSum),
      cumulativeHigh: round2(highSum),
    };
  });

  if (points.length === 0) {
    return { points: [], yMin: 0, yMax: 0 };
  }
  // Y-axis scale: include 0, the cumulative range, AND the CI band
  // extents. Pad 10% at top + bottom.
  const allY = points.flatMap((p) => [
    p.cumulative,
    p.cumulativeLow,
    p.cumulativeHigh,
  ]);
  let yMin = Math.min(0, ...allY);
  let yMax = Math.max(0, ...allY);
  const padding = (yMax - yMin) * 0.1 || 1;
  yMin -= padding;
  yMax += padding;
  return { points, yMin, yMax };
}

/* ============================================================
 * SVG render
 * ============================================================ */

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 60;
const MARGIN_LEFT = 8;
const MARGIN_RIGHT = 4;
const MARGIN_TOP = 6;
const MARGIN_BOTTOM = 12;
const PLOT_WIDTH = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

function TrajectorySvg({
  trajectory,
  hoveredIdx,
  onHover,
  leagueAvg,
}: {
  trajectory: Trajectory;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  leagueAvg: number | null;
}) {
  const { points, yMin, yMax } = trajectory;
  const n = points.length;
  const xOf = (idx: number) =>
    MARGIN_LEFT + (n === 1 ? PLOT_WIDTH / 2 : (idx / (n - 1)) * PLOT_WIDTH);
  const yOf = (v: number) =>
    MARGIN_TOP + ((yMax - v) / (yMax - yMin)) * PLOT_HEIGHT;
  const yZero = yOf(0);
  // Only render the league-avg line if it sits inside the plot range;
  // a sentinel value outside [yMin, yMax] would draw at the clipped
  // edge and confuse the reader.
  const showLeagueAvg =
    leagueAvg != null && leagueAvg >= yMin && leagueAvg <= yMax;
  const yLeagueAvg = showLeagueAvg ? yOf(leagueAvg!) : null;

  // Main line path through cumulative points.
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p.cumulative)}`)
    .join(" ");

  // Confidence ribbon: low path + high path closed.
  const ribbonPath =
    points.length > 1
      ? [
          `M ${xOf(0)} ${yOf(points[0].cumulativeHigh)}`,
          ...points
            .slice(1)
            .map((p, i) => `L ${xOf(i + 1)} ${yOf(p.cumulativeHigh)}`),
          ...points
            .slice()
            .reverse()
            .map((p, i) =>
              `L ${xOf(points.length - 1 - i)} ${yOf(p.cumulativeLow)}`,
            ),
          "Z",
        ].join(" ")
      : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        role="img"
        aria-label="Cumulative EV banked across your picks"
      >
        {/* Axes + zero baseline */}
        <line
          x1={MARGIN_LEFT}
          y1={yZero}
          x2={VIEW_WIDTH - MARGIN_RIGHT}
          y2={yZero}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="0.2"
          strokeDasharray="0.6 0.6"
        />
        <line
          x1={MARGIN_LEFT}
          y1={MARGIN_TOP}
          x2={MARGIN_LEFT}
          y2={MARGIN_TOP + PLOT_HEIGHT}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="0.15"
        />

        {/* League-average reference line + label. Renders only when
            comparison data is present and the value lands inside the
            plot range. Founder asked for "how my EV compares to league
            leaders or the average"; this is the average half of it. */}
        {showLeagueAvg && yLeagueAvg != null && (
          <g>
            <line
              x1={MARGIN_LEFT}
              y1={yLeagueAvg}
              x2={VIEW_WIDTH - MARGIN_RIGHT}
              y2={yLeagueAvg}
              stroke="var(--muted)"
              strokeOpacity="0.55"
              strokeWidth="0.18"
              strokeDasharray="0.4 0.8"
            />
            <text
              x={VIEW_WIDTH - MARGIN_RIGHT - 0.5}
              y={yLeagueAvg - 1}
              textAnchor="end"
              fontSize="2.2"
              fill="var(--muted)"
              fontFamily="ui-monospace, monospace"
            >
              league avg {leagueAvg! >= 0 ? "+" : ""}
              {leagueAvg!.toFixed(1)}
            </text>
          </g>
        )}

        {/* Confidence ribbon */}
        {ribbonPath && (
          <path
            d={ribbonPath}
            fill="var(--accent)"
            fillOpacity="0.12"
            stroke="none"
          />
        )}

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.85"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Nodes. Pick labels render only at sampled indices so 20+
            picks don't overlap into illegible text (first, last, plus
            up to 3 evenly spaced interior picks). The hover tooltip
            shows the exact pick + player for any node, so the axis
            doesn't need every label. */}
        {points.map((p, i) => {
          const cx = xOf(i);
          const cy = yOf(p.cumulative);
          const isHover = hoveredIdx === i;
          const isPositive = p.cumulative >= 0;
          const fill = isPositive
            ? "var(--success)"
            : "var(--danger)";
          const showLabel = shouldShowAxisLabel(i, points.length);
          return (
            <g key={p.entry.player_id}>
              <circle
                cx={cx}
                cy={cy}
                r={isHover ? 2.4 : 1.6}
                fill={fill}
                stroke="var(--foreground)"
                strokeOpacity="0.8"
                strokeWidth={isHover ? 0.5 : 0.25}
                className="transition-all"
                vectorEffect="non-scaling-stroke"
              />
              {/* Invisible larger hit area for hover */}
              <circle
                cx={cx}
                cy={cy}
                r={3}
                fill="transparent"
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onHover(i)}
                style={{ cursor: "pointer" }}
              />
              {showLabel && (
                <text
                  x={cx}
                  y={MARGIN_TOP + PLOT_HEIGHT + 8}
                  textAnchor="middle"
                  fontSize="2.4"
                  fill="var(--muted-2)"
                  fontFamily="ui-monospace, monospace"
                >
                  {p.pickLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Y-axis tick: top + bottom labels */}
        <text
          x={MARGIN_LEFT - 1}
          y={MARGIN_TOP + 1.5}
          textAnchor="end"
          fontSize="2.4"
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          {yMax >= 0 ? "+" : ""}
          {yMax.toFixed(1)}
        </text>
        <text
          x={MARGIN_LEFT - 1}
          y={MARGIN_TOP + PLOT_HEIGHT}
          textAnchor="end"
          fontSize="2.4"
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          {yMin >= 0 ? "+" : ""}
          {yMin.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

function SparklineSummary({ points }: { points: TrajectoryPoint[] }) {
  if (points.length < 2) return null;
  const first = points[0].cumulative;
  const last = points[points.length - 1].cumulative;
  const direction = last >= first ? "up" : "down";
  const directionColor =
    last - first >= 0 ? "text-success" : "text-danger";
  const diff = last - first;
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 text-right">
      <div>
        rolling{" "}
        <span className={directionColor}>
          {first >= 0 ? "+" : ""}
          {first.toFixed(1)} {direction === "up" ? "→" : "→"}{" "}
          {last >= 0 ? "+" : ""}
          {last.toFixed(1)}
        </span>
      </div>
      <div className="mt-1 text-muted-2">
        net {diff >= 0 ? "+" : ""}
        {diff.toFixed(1)} over {points.length - 1} pick
        {points.length - 1 === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function HoveredNodeTooltip({
  entry,
  cumulative,
}: {
  entry: EvBankPickEntry & { ev_delta: number };
  cumulative: number;
}) {
  const evDelta = entry.ev_delta;
  const evColor =
    evDelta >= 0 ? "text-success" : "text-danger";
  return (
    <div className="mt-3 rounded-md border border-border-strong bg-surface px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-[13px] font-medium text-foreground">
            {entry.player_name}
          </span>
          <span className="ml-2 font-mono text-[10px] text-muted-2">
            pick {entry.pick_label}
            {entry.position && ` · ${entry.position}`}
          </span>
        </div>
        <div className="text-right">
          <div className={`font-mono text-[14px] font-semibold ${evColor}`}>
            {evDelta >= 0 ? "+" : ""}
            {evDelta.toFixed(1)} EV
          </div>
          <div className="font-mono text-[9px] text-muted-2">
            cumulative {cumulative >= 0 ? "+" : ""}
            {cumulative.toFixed(1)}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 font-mono text-[10px] text-muted">
        {entry.adp != null && <span>ADP {Math.round(entry.adp)}</span>}
        {entry.value != null && <span>value {Math.round(entry.value)}</span>}
        <span className="text-muted-2">
          delta = (value/100) × (pick − ADP)
        </span>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Decide whether to render an axis label at this index. At small N
 * (<=6) every pick gets its label. At larger N we sample first + last
 * + ~3 evenly spaced interior points so labels never overlap. Hover
 * still shows the exact pick + player for any node, so the axis is
 * orientation, not a full index.
 */
function shouldShowAxisLabel(idx: number, total: number): boolean {
  if (total <= 6) return true;
  if (idx === 0 || idx === total - 1) return true;
  const step = Math.max(1, Math.floor((total - 1) / 4));
  return idx % step === 0;
}

/**
 * Compose the one-line league-comparison summary that sits below the
 * "Cumulative EV banked across N picks" line. Pulls rank + percentile
 * + league average from the readout. Returns null when there isn't
 * enough comparison data to be meaningful (need >= 2 ranked rosters).
 */
function buildLeagueCompareLine(
  leagueBank: LeagueEvBankReadout,
): string | null {
  if (leagueBank.ranked_count < 2) return null;
  const parts: string[] = [];
  if (leagueBank.league_avg != null) {
    parts.push(
      `league avg ${leagueBank.league_avg >= 0 ? "+" : ""}${leagueBank.league_avg.toFixed(1)}`,
    );
  }
  if (leagueBank.my_rank != null) {
    parts.push(`you rank ${leagueBank.my_rank} of ${leagueBank.ranked_count}`);
  }
  if (leagueBank.my_percentile != null) {
    parts.push(`${Math.round(leagueBank.my_percentile)}th pct`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
