/**
 * Lane cohort distribution chart. Per principle 0 + 3 of the redesign:
 * every quantitative claim ships with a defensible source and the
 * stats credibility is surfaced (not yelled) on the hub itself.
 *
 * Renders per-lane mini histograms with the user's score marker and
 * CLOSE / IN threshold lines so the user can read at a glance:
 *   1. where their roster sits in the 82-roster cohort
 *   2. what percentile their score lands at
 *   3. how far the IN threshold is from where they are
 *
 * Inline SVG so we have pixel-level control of the chart shape per the
 * redesign visualization map (no chart library unless the chart needs
 * interactive complexity).
 *
 * Cohort source: `cohort-stats.ts` (82 rosters across 5 dynasty /
 * keeper leagues, baked 2026-05-08). Provenance rendered inline on the
 * section header per principle 0.
 */

import type { LaneMembership } from "@/lib/strategy/lane-identity";
import {
  COHORT_TOTAL,
  COHORT_LEAGUE_COUNT,
  COHORT_GENERATED_AT,
  COHORT_STATS_BY_LANE,
  percentileForScore,
} from "@/lib/strategy/lane-identity/cohort-stats";

const CHART_WIDTH = 280;
const CHART_HEIGHT = 60;
const X_AXIS_HEIGHT = 14;
const MAX_LANES_RENDERED = 4;

/**
 * Score-rank the user's lanes so the chart leads with the strongest /
 * most-relevant signals. IN beats CLOSE beats NOT_IN; within a state
 * sort by percentile descending so the most-extreme positions surface.
 */
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
        score {Math.round(userScore)} · {userPct}th percentile
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + X_AXIS_HEIGHT}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${membership.label} cohort distribution: your score ${Math.round(userScore)} at the ${userPct}th percentile`}
      >
        {stats.bins.map((count, i) => {
          const h = (count / maxCount) * CHART_HEIGHT;
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

        <line
          x1={closeX}
          x2={closeX}
          y1={0}
          y2={CHART_HEIGHT}
          stroke="var(--warning)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.65}
        />
        <line
          x1={inX}
          x2={inX}
          y1={0}
          y2={CHART_HEIGHT}
          stroke="var(--success)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.75}
        />

        {userInRange && (
          <>
            <line
              x1={userX}
              x2={userX}
              y1={0}
              y2={CHART_HEIGHT}
              stroke="#a78bfa"
              strokeWidth={2}
            />
            <circle cx={userX} cy={4} r={3} fill="#a78bfa" />
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

        <text
          x={0}
          y={CHART_HEIGHT + X_AXIS_HEIGHT - 3}
          fontSize={8}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          0
        </text>
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

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[9px] text-muted-2">
        <span>
          <span className="text-warning">close</span> {stats.close_threshold}
        </span>
        <span>
          <span className="text-success">in</span> {stats.in_threshold}
        </span>
        <span>cohort median {stats.p50}</span>
      </div>
    </div>
  );
}
