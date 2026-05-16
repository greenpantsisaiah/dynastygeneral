/**
 * Lane cohort distribution chart. Per principle 0 + 3 of the redesign:
 * every quantitative claim ships with a defensible source and the
 * stats credibility is surfaced (not yelled) on the hub itself.
 *
 * Each per-lane mini-chart shows:
 *   1. Cohort histogram (accent-tinted bars) of where the 82 rosters
 *      score on this lane.
 *   2. Two dashed threshold lines: CLOSE (warning) and IN (success).
 *      Inline text labels float next to each line so the dashed color
 *      is unambiguous.
 *   3. The user's score as a purple anchor with an inline "YOU"
 *      label, so the marker is self-explanatory.
 *
 * Per founder feedback 2026-05-15: "the huge left yellow line, the
 * green and yellow dashed ones" weren't clear without inline labels.
 * Adding inline labels + a top-of-section legend.
 *
 * Cohort source: `cohort-stats.ts` (82 rosters across 5 dynasty /
 * keeper leagues, baked 2026-05-08).
 */

import type { LaneMembership } from "@/lib/strategy/lane-identity";
import {
  COHORT_TOTAL,
  COHORT_LEAGUE_COUNT,
  COHORT_GENERATED_AT,
  COHORT_STATS_BY_LANE,
  percentileForScore,
} from "@/lib/strategy/lane-identity/cohort-stats";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 70;
const X_AXIS_HEIGHT = 16;
const TOP_PAD = 14;
const MAX_LANES_RENDERED = 4;

function selectLanesToRender(
  memberships: LaneMembership[],
): LaneMembership[] {
  const stateRank: Record<LaneMembership["state"], number> = {
    in: 0,
    close: 1,
    not_in: 2,
  };
  const eligible = memberships.filter(
    (m) => m.axis !== "composite" && m.aggregate_score > 0,
  );
  return [...eligible]
    .sort((a, b) => {
      const stateDiff = stateRank[a.state] - stateRank[b.state];
      if (stateDiff !== 0) return stateDiff;
      const aPct = percentileForScore(a.lane_id, a.aggregate_score);
      const bPct = percentileForScore(b.lane_id, b.aggregate_score);
      return bPct - aPct;
    })
    .slice(0, MAX_LANES_RENDERED);
}

export function LaneCohortDistribution({
  memberships,
}: {
  memberships: LaneMembership[];
}) {
  const lanes = selectLanesToRender(memberships);
  if (lanes.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-border-soft bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Where you sit in the cohort
          </div>
          <p className="mt-1 text-sm text-muted">
            Your lane scores plotted against {COHORT_TOTAL} dynasty / keeper
            rosters across {COHORT_LEAGUE_COUNT} leagues. The IN and CLOSE
            thresholds are the same ones the engine uses to read your
            roster identity.
          </p>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2"
          title={`Cohort baked ${COHORT_GENERATED_AT} from cohort.json (gitignored). Aggregate bins + percentiles only.`}
        >
          n = {COHORT_TOTAL} · {COHORT_GENERATED_AT}
        </span>
      </div>

      {/* Inline legend so the user can decode each chart without
          guessing what the colors and dashed lines mean. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-2">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-3 rounded-sm bg-accent/30 border border-accent/50"
            aria-hidden
          />
          <span>Cohort rosters at each score</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-px bg-warning"
            style={{ backgroundImage: "repeating-linear-gradient(to bottom, var(--warning) 0 3px, transparent 3px 5px)" }}
            aria-hidden
          />
          <span className="text-warning">CLOSE threshold</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-px bg-success"
            style={{ backgroundImage: "repeating-linear-gradient(to bottom, var(--success) 0 3px, transparent 3px 5px)" }}
            aria-hidden
          />
          <span className="text-success">IN threshold</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-0.5 bg-[color:#a78bfa]"
            aria-hidden
          />
          <span className="text-[color:#a78bfa]">Your score</span>
        </span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {lanes.map((m) => (
          <LaneDistribution key={m.lane_id} membership={m} />
        ))}
      </div>
    </section>
  );
}

function LaneDistribution({ membership }: { membership: LaneMembership }) {
  const stats = COHORT_STATS_BY_LANE[membership.lane_id];
  if (!stats) return null;

  const userScore = membership.aggregate_score;
  const userPct = percentileForScore(membership.lane_id, userScore);
  const maxCount = Math.max(...stats.bins, 1);
  const innerH = CHART_HEIGHT - TOP_PAD;
  const binPxWidth = CHART_WIDTH / stats.bins.length;

  const scoreToX = (s: number): number => {
    const clamped = Math.min(Math.max(s, 0), stats.range_max);
    return (clamped / stats.range_max) * CHART_WIDTH;
  };

  const userInRange = userScore <= stats.range_max;
  const userX = scoreToX(userScore);
  const closeX = scoreToX(stats.close_threshold);
  const inX = scoreToX(stats.in_threshold);

  const stateLabel =
    membership.state === "in"
      ? "IN"
      : membership.state === "close"
        ? "CLOSE"
        : "NOT IN";
  const stateTone =
    membership.state === "in"
      ? "text-success"
      : membership.state === "close"
        ? "text-accent"
        : "text-muted-2";

  // Position the inline labels for thresholds + user marker. When
  // two labels would overlap, push the second one down a row so they
  // stay readable.
  const labelGap = 38;
  const closeLabelX = closeX;
  const inLabelX = inX;
  const userLabelX = userX;
  const closeAndInClose = Math.abs(inX - closeX) < labelGap;
  const userNearClose = userInRange && Math.abs(userX - closeX) < labelGap;
  const userNearIn = userInRange && Math.abs(userX - inX) < labelGap;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">
          {membership.label}
        </div>
        <div className={`font-mono text-[9px] uppercase tracking-[0.14em] ${stateTone}`}>
          {stateLabel}
        </div>
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-2">
        score {Math.round(userScore)} · {userPct}th percentile · cohort
        median {stats.p50}
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + X_AXIS_HEIGHT}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${membership.label} cohort distribution: your score ${Math.round(userScore)} at the ${userPct}th percentile`}
      >
        {stats.bins.map((count, i) => {
          const h = (count / maxCount) * innerH;
          const x = i * binPxWidth;
          const y = CHART_HEIGHT - h;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(binPxWidth - 1, 1)}
              height={h}
              fill="var(--accent)"
              fillOpacity={0.18}
              stroke="var(--accent)"
              strokeOpacity={0.35}
              strokeWidth={0.5}
            />
          );
        })}

        {/* CLOSE threshold + inline label */}
        <line
          x1={closeX}
          x2={closeX}
          y1={TOP_PAD - 2}
          y2={CHART_HEIGHT}
          stroke="var(--warning)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.75}
        />
        <text
          x={closeLabelX}
          y={TOP_PAD - 4}
          fontSize={8}
          fill="var(--warning)"
          textAnchor={closeAndInClose || userNearClose ? "end" : "middle"}
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          close · {stats.close_threshold}
        </text>

        {/* IN threshold + inline label */}
        <line
          x1={inX}
          x2={inX}
          y1={TOP_PAD - 2}
          y2={CHART_HEIGHT}
          stroke="var(--success)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.85}
        />
        <text
          x={inLabelX}
          y={TOP_PAD - 4}
          fontSize={8}
          fill="var(--success)"
          textAnchor={closeAndInClose ? "start" : "middle"}
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
        >
          in · {stats.in_threshold}
        </text>

        {/* User marker + inline "YOU" label */}
        {userInRange && (
          <>
            <line
              x1={userX}
              x2={userX}
              y1={TOP_PAD - 6}
              y2={CHART_HEIGHT}
              stroke="#a78bfa"
              strokeWidth={2}
            />
            <circle cx={userX} cy={TOP_PAD - 6} r={3.5} fill="#a78bfa" />
            <text
              x={userLabelX}
              y={CHART_HEIGHT + X_AXIS_HEIGHT - 3}
              fontSize={9}
              fill="#a78bfa"
              textAnchor={
                userNearClose || userNearIn
                  ? userX < CHART_WIDTH / 2
                    ? "start"
                    : "end"
                  : "middle"
              }
              fontFamily="ui-monospace, monospace"
              fontWeight={600}
              style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              you · {Math.round(userScore)}
            </text>
          </>
        )}

        <line
          x1={0}
          x2={CHART_WIDTH}
          y1={CHART_HEIGHT}
          y2={CHART_HEIGHT}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />

        {!userInRange && (
          <text
            x={0}
            y={CHART_HEIGHT + X_AXIS_HEIGHT - 3}
            fontSize={8}
            fill="var(--muted-2)"
            fontFamily="ui-monospace, monospace"
          >
            0
          </text>
        )}
        <text
          x={CHART_WIDTH}
          y={CHART_HEIGHT + X_AXIS_HEIGHT - 3}
          fontSize={8}
          textAnchor="end"
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          {Math.round(stats.range_max)}
        </text>
      </svg>
    </div>
  );
}
