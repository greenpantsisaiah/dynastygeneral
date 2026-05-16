"use client";

/**
 * Roster Build Fit. The Venn-membership panel.
 *
 * Renders the builds the roster FITS (with contributing players),
 * builds the roster PARTLY FITS (with the gap line and move type),
 * and a collapsed expander for builds that DON'T FIT.
 *
 * Per founder direction 2026-05-11: a roster matches N builds
 * simultaneously, not on a single horizon point. This panel shows
 * the Venn picture across horizon + archetype + composite axes.
 *
 * Vocabulary note 2026-05-15: surface copy renamed from
 * "lane/IN/CLOSE/NOT IN" to "build/FITS/PARTIAL/NO FIT" because the
 * lane metaphor didn't compose with multi-membership ("close to a
 * lane" is meaningless). Internal data layer (LaneMembership,
 * lane_id, etc.) keeps the original names; only user-facing copy
 * changed.
 *
 * Voice is descriptive, never evaluative; builds are characterized,
 * not graded.
 *
 * Reads canonical LaneMembership[] from aggregateRosterIdentity. No
 * scoring or threshold logic in the component.
 */

import { useState } from "react";
import type {
  IdentityMove,
  LaneMembership,
} from "@/lib/strategy/lane-identity";

const STATE_STYLES = {
  in: {
    border: "border-success/60",
    bg: "bg-success/5",
    pillText: "text-success",
    pillBorder: "border-success/60",
    label: "FITS",
  },
  close: {
    border: "border-warning/50",
    bg: "bg-warning/5",
    pillText: "text-warning",
    pillBorder: "border-warning/50",
    label: "PARTIAL",
  },
  not_in: {
    border: "border-border-soft",
    bg: "bg-surface/30",
    pillText: "text-muted-2",
    pillBorder: "border-border-soft",
    label: "NO FIT",
  },
} as const;

const AXIS_LABEL = {
  horizon: "Horizon",
  archetype: "Archetype",
  composite: "Composite",
} as const;

export type RosterLaneIdentityProps = {
  memberships: LaneMembership[];
  /**
   * Optional identity-moves data. When present, CLOSE-lane cards
   * render a "Targets" + "Funding" block beneath the gap line so the
   * user can see specific opponent-rostered players to trade for and
   * their own surplus pieces to package.
   */
  moves?: IdentityMove[];
  /**
   * Optional per-lane state from the user's last visit. When a lane
   * has a prior state and the current state differs, the card shows
   * a small transition indicator ("was CLOSE"). Empty object on
   * first visit = no transitions shown.
   */
  priorStates?: Record<string, "in" | "close" | "not_in">;
};

export function RosterLaneIdentity({
  memberships,
  moves = [],
  priorStates = {},
}: RosterLaneIdentityProps) {
  const [showNotIn, setShowNotIn] = useState(false);

  if (memberships.length === 0) return null;

  const inLanes = memberships.filter((m) => m.state === "in");
  const closeLanes = memberships.filter((m) => m.state === "close");
  const notInLanes = memberships.filter((m) => m.state === "not_in");

  const movesByLane = new Map(moves.map((m) => [m.lane_id, m]));

  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border border-border-strong bg-surface"
      aria-label="Roster build fit"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-soft px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Roster build fit
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {inLanes.length} fits · {closeLanes.length} partial · {notInLanes.length} no fit
          </span>
        </div>
      </header>

      {inLanes.length > 0 && (
        <div className="border-b border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-success mb-3">
            Builds you fit ({inLanes.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {inLanes.map((m) => (
              <LaneCard
                key={m.lane_id}
                membership={m}
                priorState={priorStates[m.lane_id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {closeLanes.length > 0 && (
        <div className="border-b border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning mb-3">
            Builds you partly fit ({closeLanes.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {closeLanes.map((m) => (
              <LaneCard
                key={m.lane_id}
                membership={m}
                move={movesByLane.get(m.lane_id)}
                priorState={priorStates[m.lane_id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {/* When the user has NO IN or CLOSE lanes (common on in-season
          rosters whose value is diffuse rather than concentrated),
          surface the 3 NOT-IN lanes closest to CLOSE as "closest to
          entering." Without this, the section reads as "you have no
          identity" which is misleading when the math is just
          calibrated against startup-draft cohorts. */}
      {inLanes.length === 0 && closeLanes.length === 0 && notInLanes.length > 0 && (
        <div className="border-b border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2 mb-2">
            Closest to a partial fit
          </div>
          <p className="text-xs leading-snug text-muted">
            Fit thresholds are calibrated against fresh-startup cohorts.
            In-season rosters often spread value diffusely without
            matching any single build. These three are nearest to a
            partial fit.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[...notInLanes]
              .filter((m) => m.aggregate_score > 0 && m.close_threshold > 0)
              .sort(
                (a, b) =>
                  b.aggregate_score / b.close_threshold -
                  a.aggregate_score / a.close_threshold,
              )
              .slice(0, 3)
              .map((m) => (
                <LaneCard
                  key={m.lane_id}
                  membership={m}
                  showProximity
                />
              ))}
          </div>
        </div>
      )}

      {notInLanes.length > 0 && (
        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => setShowNotIn((s) => !s)}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={showNotIn}
          >
            {showNotIn ? "Hide" : "Show"} builds that don't fit ({notInLanes.length})
          </button>
          {showNotIn && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {notInLanes.map((m) => (
                <LaneCard key={m.lane_id} membership={m} compact />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LaneCard({
  membership: m,
  compact = false,
  move,
  priorState = null,
  showProximity = false,
}: {
  membership: LaneMembership;
  compact?: boolean;
  move?: IdentityMove;
  priorState?: "in" | "close" | "not_in" | null;
  /**
   * When true, render the "closest to entering" framing: show the
   * score, the close threshold, and the percentage of the way there
   * inline so a NOT-IN lane is still informative.
   */
  showProximity?: boolean;
}) {
  const stateChanged = priorState != null && priorState !== m.state;
  const style = STATE_STYLES[m.state];
  const contributors = m.contributors.slice(0, compact ? 0 : 5);
  const proximityPct =
    showProximity && m.close_threshold > 0
      ? Math.round((m.aggregate_score / m.close_threshold) * 100)
      : null;
  return (
    <div
      className={`rounded-md border ${style.border} ${style.bg} px-3 py-3`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold leading-tight text-foreground">
            {m.label}
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            {AXIS_LABEL[m.axis as keyof typeof AXIS_LABEL] ?? m.axis}
            {m.is_derived && " · composite"}
            {proximityPct != null && (
              <span className="text-foreground">
                {" · "}
                {proximityPct}% of the way to a partial fit
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {stateChanged && priorState && (
            <span
              className="font-mono text-[8px] uppercase tracking-[0.18em] text-accent"
              title={`Was ${STATE_STYLES[priorState].label.toLowerCase()} on your last visit`}
            >
              was {STATE_STYLES[priorState].label}
            </span>
          )}
          <span
            className={`font-mono text-[8px] uppercase tracking-[0.18em] ${style.pillText} border ${style.pillBorder} rounded-full px-1.5 py-0.5`}
          >
            {style.label}
          </span>
        </div>
      </div>

      {!compact && (
        <p className="mt-2 text-[11px] leading-snug text-muted">{m.blurb}</p>
      )}

      {!compact && contributors.length > 0 && (
        <div className="mt-2 space-y-1">
          {contributors.map((c) => (
            <div
              key={c.player_id}
              className="flex items-baseline justify-between gap-2 text-[11px] leading-tight"
            >
              <span className="truncate text-foreground">
                {c.name}
                {c.position && (
                  <span className="ml-1 font-mono text-[9px] text-muted-2">
                    · {c.position}
                  </span>
                )}
              </span>
              <span className="font-mono text-[10px] text-muted-2">
                {c.contribution}
              </span>
            </div>
          ))}
          {m.contributors.length > contributors.length && (
            <div className="font-mono text-[9px] text-muted-2">
              + {m.contributors.length - contributors.length} more
            </div>
          )}
        </div>
      )}

      {!compact && m.gap && (
        <div className="mt-2 border-t border-border-soft pt-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
            Gap
          </div>
          <p className="mt-1 text-[11px] leading-snug text-foreground">
            {m.gap.description}
          </p>
        </div>
      )}

      {!compact && move && move.targets.length > 0 && (
        <div className="mt-2 border-t border-border-soft pt-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
            Targets
          </div>
          <div className="mt-1 space-y-1">
            {move.targets.map((t) => (
              <div
                key={t.player_id}
                className="flex items-baseline justify-between gap-2 text-[11px] leading-tight"
              >
                <span className="truncate text-foreground">
                  {t.name}
                  {t.position && (
                    <span className="ml-1 font-mono text-[9px] text-muted-2">
                      · {t.position}
                      {t.age != null && ` · age ${t.age}`}
                    </span>
                  )}
                  {t.owner_name && (
                    <span className="ml-1 font-mono text-[9px] text-muted-2">
                      on {t.owner_name}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-muted-2">
                  val {Math.round(t.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && move && move.funding.length > 0 && (
        <div className="mt-2 border-t border-border-soft pt-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
            What you can package
          </div>
          <div className="mt-1 space-y-1">
            {move.funding.map((f) => (
              <div
                key={f.player_id}
                className="flex items-baseline justify-between gap-2 text-[11px] leading-tight"
              >
                <span className="truncate text-foreground">
                  {f.name}
                  {f.position && (
                    <span className="ml-1 font-mono text-[9px] text-muted-2">
                      · {f.position}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-muted-2">
                  val {Math.round(f.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div className="mt-2 font-mono text-[9px] text-muted-2">
          score {m.aggregate_score} · close {m.close_threshold} / in {m.in_threshold}
        </div>
      )}
    </div>
  );
}
