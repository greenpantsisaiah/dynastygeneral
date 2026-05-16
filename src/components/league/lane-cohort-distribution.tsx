/**
 * Build fit progress bars. Per founder feedback 2026-05-15 and
 * 2026-05-16:
 *
 *  - The original histogram-with-thresholds visual asked users to
 *    read statistics. Replaced with a progress-bar / XP-bar metaphor
 *    (three colored zones, fill stops at user's score).
 *  - The vocabulary "lane / IN / CLOSE / NOT IN" did not compose.
 *    Replaced with "build / FITS / PARTIAL / NO FIT".
 *  - "Cohort" was unexplained jargon. Replaced with "benchmark
 *    rosters" + a plain-English lead sentence that names what we're
 *    comparing against ("82 real dynasty teams we benchmarked the
 *    model against").
 *  - Per-build inline blurb so the user knows what each pattern
 *    means without leaving the panel.
 *  - Synthesis band at the top interprets the overall shape so the
 *    repeated NO FIT pills below can't be misread as a grade.
 *
 * Benchmark source: `cohort-stats.ts` (82 real dynasty / keeper
 * rosters across 5 leagues, snapshotted 2026-05-08). Internal data
 * names (LaneMembership, cohort-stats, etc.) keep their original
 * naming; only user-facing copy uses the new vocabulary.
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

/**
 * Read the user's overall build-fit shape and produce a one-paragraph
 * synthesis. The chart's bars by themselves read as a grade
 * ("4x NO FIT means my team sucks") even when the user is solidly
 * mid-pack to above-median on percentile. The synthesis names the
 * SHAPE of the roster and contextualizes the calibration cohort so
 * NO FIT cannot be misread as a verdict.
 *
 * Founder report 2026-05-16: "Does this just say 'your team sucks at
 * everything' or is there more to it?" There is more. This paragraph
 * is the more.
 */
function composeBuildFitSynthesis(memberships: LaneMembership[]): {
  headline: string;
  body: string;
} {
  const baseLanes = memberships.filter((m) => m.axis !== "composite");
  const fits = baseLanes.filter((m) => m.state === "in");
  const partials = baseLanes.filter((m) => m.state === "close");

  if (fits.length > 0) {
    const fitNames = fits.map((m) => m.label).join(", ");
    const partialClause =
      partials.length > 0
        ? ` Partway into ${partials.length} more (${partials.map((m) => m.label).join(", ")}).`
        : "";
    return {
      headline: `Your roster fits ${fits.length} build${fits.length === 1 ? "" : "s"}.`,
      body: `Strong fits: ${fitNames}.${partialClause}`,
    };
  }

  if (partials.length > 0) {
    const partialNames = partials.map((m) => m.label).join(", ");
    return {
      headline: `Your roster is partway into ${partials.length} build${partials.length === 1 ? "" : "s"}.`,
      body: `Partial fits: ${partialNames}. One or two targeted acquisitions could push you over into a strong fit.`,
    };
  }

  // All NO FIT. Characterize the shape from percentile data rather
  // than letting the pill repetition tell the user they are bad.
  const scored = baseLanes
    .map((m) => ({
      m,
      pct: percentileForScore(m.lane_id, m.aggregate_score),
    }))
    .filter((x) => x.m.aggregate_score > 0);

  if (scored.length === 0) {
    return {
      headline: "Roster builds not yet evaluable.",
      body: "Not enough resolved value on the roster to score against the cohort yet.",
    };
  }

  const avgPct =
    scored.reduce((s, x) => s + x.pct, 0) / scored.length;
  const strongest = scored.reduce((best, x) =>
    x.pct > best.pct ? x : best,
  );
  const aboveMedian = scored.filter((x) => x.pct >= 50).length;

  if (avgPct >= 50) {
    return {
      headline: "Your roster is diffuse, not concentrated.",
      body: `Your value spreads across multiple builds rather than stacking into one. Strongest match is ${strongest.m.label}, where you sit above ${strongest.pct}% of the benchmark rosters; ${aboveMedian} of ${scored.length} builds shown sit above the benchmark median. NO FIT here is not a grade. The thresholds are set from fresh-startup rosters that concentrate into single archetypes; in-season rosters that traded value across positions normally read this way.`,
    };
  }

  if (avgPct >= 30) {
    return {
      headline: "Mid-pack roster shape.",
      body: `Your strongest match is ${strongest.m.label}, where you sit above ${strongest.pct}% of the benchmark rosters. The other builds land near the benchmark median or just below. Thresholds are set from fresh-startup rosters that concentrate into archetypes; in-season rosters with spread value normally read this way without flagging a fit.`,
    };
  }

  return {
    headline: "Roster sits below the benchmark band.",
    body: `Strongest match is ${strongest.m.label}, where you sit above ${strongest.pct}% of the benchmark rosters. The benchmark set skews startup-builder concentration; in-season rosters in active rebuild often read below the band until value consolidates.`,
  };
}

export function LaneCohortDistribution({
  memberships,
}: {
  memberships: LaneMembership[];
}) {
  const lanes = selectLanesToRender(memberships);
  if (lanes.length === 0) return null;
  const synthesis = composeBuildFitSynthesis(memberships);

  return (
    <section className="mt-6 rounded-lg border border-border-soft bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Build fit
          </div>
          <p className="mt-1 text-sm text-muted">
            Your roster compared to the shapes of{" "}
            <span
              className="text-foreground"
              title={`Benchmark rosters: ${COHORT_TOTAL} real dynasty and keeper teams we pulled from ${COHORT_LEAGUE_COUNT} leagues on ${COHORT_GENERATED_AT}. The model studied them to find what each build pattern actually looks like in a built roster.`}
            >
              {COHORT_TOTAL} real dynasty teams
            </span>{" "}
            we benchmarked the model against. Each build below is a
            value-stack shape we found repeating across those real
            rosters. Your bar tells you how close your shape is to
            each pattern.
          </p>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2"
          title={`Benchmark set: ${COHORT_TOTAL} real dynasty and keeper rosters from ${COHORT_LEAGUE_COUNT} leagues, snapshotted ${COHORT_GENERATED_AT}. Aggregate bins + percentiles only.`}
        >
          {COHORT_TOTAL} benchmark rosters · {COHORT_LEAGUE_COUNT} leagues
        </span>
      </div>

      {/* Shape synthesis. Reads the percentile data and tells the
          user what their overall build-fit pattern means, so the
          NO FIT pills below can't be misread as a grade. */}
      <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Reading your shape
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
          {synthesis.headline}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {synthesis.body}
        </p>
      </div>

      {/* Compact zone legend. Maps each zone to plain words so the
          first read of any bar below resolves without scrolling. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-2">
        <span
          className="flex items-center gap-1.5"
          title="Gray zone: your roster does not yet match this build. Not enough concentrated value at the build's signature shape."
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-muted-2/30"
            aria-hidden
          />
          <span>NO FIT</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Yellow zone: one or two acquisitions away from a strong fit. The engine reads you as partway built toward this archetype."
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-warning/40"
            aria-hidden
          />
          <span className="text-warning">PARTIAL</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          title="Green zone: your roster fits this build. Enough concentrated value the engine reads you as committed to this archetype."
        >
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-success/45"
            aria-hidden
          />
          <span className="text-success">FITS</span>
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
    label: "FITS",
    cls: "border-success/60 text-success bg-success/10",
  },
  close: {
    label: "PARTIAL",
    cls: "border-warning/60 text-warning bg-warning/10",
  },
  not_in: {
    label: "NO FIT",
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
      ? `${Math.round(distanceToNextZone)} points to a PARTIAL fit`
      : membership.state === "close" && distanceToNextZone !== null
        ? `${Math.round(distanceToNextZone)} points to FIT`
        : membership.state === "in"
          ? `${Math.round(userScore - stats.in_threshold)} points past the FIT threshold`
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
      {membership.blurb && (
        <p className="mt-0.5 text-[11px] leading-snug text-muted">
          {membership.blurb}
        </p>
      )}

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
          PARTIAL {Math.round(stats.close_threshold)}
        </span>
        <span
          className="absolute -translate-x-1/2 text-success"
          style={{ left: `${inPct}%` }}
        >
          FIT {Math.round(stats.in_threshold)}
        </span>
      </div>

      {/* Score + benchmark-rank + next-zone caption. */}
      <div className="mt-3 font-mono text-[10px] leading-snug text-muted-2">
        <span className="text-[color:#a78bfa]">
          your score {Math.round(userScore)}
        </span>
        {" · "}
        <span
          title={`Your score on this build is higher than ${userPct}% of the ${COHORT_TOTAL} benchmark rosters.`}
        >
          above {userPct}% of benchmarks
        </span>
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
