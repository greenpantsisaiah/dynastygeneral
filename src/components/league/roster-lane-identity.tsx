"use client";

/**
 * Roster Lane Identity. The Venn-membership panel.
 *
 * Renders the lanes the roster is IN (with contributing players),
 * lanes the roster is CLOSE to (with the gap line and move type),
 * and a collapsed expander for lanes the roster is NOT_IN.
 *
 * Per founder direction 2026-05-11: a roster is in N lanes
 * simultaneously, not on a single horizon point. This panel shows
 * the Venn picture across horizon + archetype + composite axes.
 * Voice is descriptive, never evaluative; lanes are characterized,
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
    label: "IN",
  },
  close: {
    border: "border-warning/50",
    bg: "bg-warning/5",
    pillText: "text-warning",
    pillBorder: "border-warning/50",
    label: "CLOSE",
  },
  not_in: {
    border: "border-border-soft",
    bg: "bg-surface/30",
    pillText: "text-muted-2",
    pillBorder: "border-border-soft",
    label: "NOT IN",
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
      aria-label="Roster lane identity"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-soft px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Roster identity
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {inLanes.length} in · {closeLanes.length} close · {notInLanes.length} not in
          </span>
        </div>
      </header>

      {inLanes.length > 0 && (
        <div className="border-b border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-success mb-3">
            Lanes you are in ({inLanes.length})
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
            Lanes you are close to ({closeLanes.length})
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

      {notInLanes.length > 0 && (
        <div className="px-5 py-3">
          <button
            type="button"
            onClick={() => setShowNotIn((s) => !s)}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={showNotIn}
          >
            {showNotIn ? "Hide" : "Show"} lanes you are not in ({notInLanes.length})
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
}: {
  membership: LaneMembership;
  compact?: boolean;
  move?: IdentityMove;
  priorState?: "in" | "close" | "not_in" | null;
}) {
  const stateChanged = priorState != null && priorState !== m.state;
  const style = STATE_STYLES[m.state];
  const contributors = m.contributors.slice(0, compact ? 0 : 5);
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
