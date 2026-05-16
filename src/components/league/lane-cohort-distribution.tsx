/**
 * Lane progress bars. Per founder feedback 2026-05-15: the prior
 * histogram-with-thresholds visual asked users to read statistics
 * ("here's the cohort, here are two dashed lines, here's where you
 * are"). It buried the question the user was actually asking: how
 * far am I from being IN this lane?
 *
 * Replaced with a progress-bar / XP-bar metaphor. Each lane is a
 * single horizontal bar split into three zones:
 *
 *   - 0 to CLOSE: NOT IN zone (gray)
 *   - CLOSE to IN: CLOSE zone (yellow)
 *   - IN to max: IN zone (green)
 *
 * The user's fill grows from left to right and stops at their score.
 * The zone where the fill ends colors the fill itself, so the
 * status (NOT IN / CLOSE / IN) reads spatially before the user
 * reads any words. Cohort context survives as a one-line "you
 * vs cohort median" caption per lane.
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
            Lane progress
          </div>
          <p className="mt-1 text-sm text-muted">
            How far your roster is from each lane. The bar fills as
            your score rises; the color of the zone you end up in
            tells you whether you are NOT IN, CLOSE, or IN. Thresholds
            calibrated against {COHORT_TOTAL} dynasty / keeper rosters
            across {COHORT_LEAGUE_COUNT} leagues.
          </p>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2"
          title={`Cohort baked ${COHORT_GENERATED_AT} from cohort.json (gitignored). Aggregate bins + percentiles only.`}
        >
          n = {COHORT_TOTAL} · {COHORT_GENERATED_AT}
        </span>
      </div>

      {/* Compact zone legend. Maps each zone to plain words so the
          first read of any bar below resolves without scrolling. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-2">
        <span
          className="flex items-center gap-1.5"
          title="Gray zone: your roster has not yet accumulated enough concentrated value to be CLOSE to this lane."
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-muted-2/30"
            aria-hidden
          />
          <span>NOT IN</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Yellow zone: one or two acquisitions away from being IN this lane. The engine reads you as 'partway in.'"
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-warning/40"
            aria-hidden
          />
          <span className="text-warning">CLOSE</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Green zone: your roster fits this lane. Enough concentrated value the engine treats you as committed to this archetype."
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-success/45"
            aria-hidden
          />
          <span className="text-success">IN</span>
        </span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {lanes.map((m) => (
          <LaneProgressBar key={m.lane_id} membership={m} />
        ))}
      </div>
    </section>
  );
}

const ZONE_LABEL_PILL: Record<
  LaneMembership["state"],
  { label: string; cls: string }
> = {
  in: {
    label: "IN",
    cls: "border-success/60 text-success bg-success/10",
  },
  close: {
    label: "CLOSE",
    cls: "border-warning/60 text-warning bg-warning/10",
  },
  not_in: {
    label: "NOT IN",
    cls: "border-border-soft text-muted-2 bg-surface-2",
  },
};

function LaneProgressBar({ membership }: { membership: LaneMembership }) {
  const stats = COHORT_STATS_BY_LANE[membership.lane_id];
  if (!stats) return null;

  const userScore = membership.aggregate_score;
  const userPct = percentileForScore(membership.lane_id, userScore);
  // Bar domain: 0 to whichever is larger between the cohort range_max
  // and the user's score. A user who blew past the cohort never falls
  // off the right edge.
  const domainMax = Math.max(stats.range_max, userScore, stats.in_threshold);

  const closePct = (stats.close_threshold / domainMax) * 100;
  const inPct = (stats.in_threshold / domainMax) * 100;
  const fillPct = Math.min(100, (userScore / domainMax) * 100);

  // Fill color follows the zone the user lands in. Spatial color
  // map: gray fill = NOT IN, yellow fill = CLOSE, green fill = IN.
  const fillTone =
    membership.state === "in"
      ? "bg-success"
      : membership.state === "close"
        ? "bg-warning"
        : "bg-muted-2";

  const pill = ZONE_LABEL_PILL[membership.state];
  const distanceToNextZone =
    membership.state === "not_in"
      ? Math.max(0, stats.close_threshold - userScore)
      : membership.state === "close"
        ? Math.max(0, stats.in_threshold - userScore)
        : null;
  const distanceCaption =
    membership.state === "not_in" && distanceToNextZone !== null
      ? `${Math.round(distanceToNextZone)} score to reach CLOSE`
      : membership.state === "close" && distanceToNextZone !== null
        ? `${Math.round(distanceToNextZone)} score to reach IN`
        : membership.state === "in"
          ? `${Math.round(userScore - stats.in_threshold)} score past IN`
          : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">
          {membership.label}
        </div>
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.14em] border rounded-sm px-1.5 py-0 ${pill.cls}`}
        >
          {pill.label}
        </span>
      </div>

      {/* Zone bar: three stacked segments with the user's fill on top. */}
      <div className="mt-2 relative h-5 w-full overflow-hidden rounded-sm bg-surface-2">
        {/* Zone backgrounds */}
        <div
          className="absolute left-0 top-0 h-full bg-muted-2/15"
          style={{ width: `${closePct}%` }}
          aria-hidden
        />
        <div
          className="absolute top-0 h-full bg-warning/15"
          style={{ left: `${closePct}%`, width: `${inPct - closePct}%` }}
          aria-hidden
        />
        <div
          className="absolute top-0 h-full bg-success/15"
          style={{ left: `${inPct}%`, width: `${100 - inPct}%` }}
          aria-hidden
        />

        {/* User fill: solid bar from 0 to user's score, tone matches zone. */}
        <div
          className={`absolute left-0 top-0 h-full ${fillTone}`}
          style={{ width: `${fillPct}%`, opacity: 0.65 }}
          aria-hidden
        />

        {/* Threshold gate ticks. Small vertical bars on the bar itself
            so the boundary between zones reads as a literal gate. */}
        <div
          className="absolute top-0 h-full w-px bg-warning"
          style={{ left: `${closePct}%` }}
          aria-hidden
        />
        <div
          className="absolute top-0 h-full w-px bg-success"
          style={{ left: `${inPct}%` }}
          aria-hidden
        />

        {/* User marker tick on top of fill. */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[color:#a78bfa]"
          style={{ left: `${fillPct}%` }}
          aria-hidden
        />
      </div>

      {/* Threshold scale row below the bar. Positions match the
          dashed lines inside the bar so the gates are labeled. */}
      <div className="relative mt-1 h-3 text-[9px] font-mono text-muted-2">
        <span
          className="absolute -translate-x-1/2 text-warning"
          style={{ left: `${closePct}%` }}
        >
          CLOSE {Math.round(stats.close_threshold)}
        </span>
        <span
          className="absolute -translate-x-1/2 text-success"
          style={{ left: `${inPct}%` }}
        >
          IN {Math.round(stats.in_threshold)}
        </span>
      </div>

      {/* Score + cohort + next-zone caption. */}
      <div className="mt-3 font-mono text-[10px] leading-snug text-muted-2">
        <span className="text-[color:#a78bfa]">
          your score {Math.round(userScore)}
        </span>
        {" · "}
        <span>{userPct}th percentile of cohort</span>
        {distanceCaption && (
          <>
            {" · "}
            <span className="text-foreground">{distanceCaption}</span>
          </>
        )}
      </div>
    </div>
  );
}
