"use client";

/**
 * The Call. Per-pick canonical surface for the redesigned hub.
 *
 * Replaces the legacy <DecisionCard> as the standing-call surface.
 * Renders mobile-first, single-column. Voice A throughout; Voice B
 * accents activate when the user has flipped Sloan mode (CIs and
 * provenance surface inline, same data).
 *
 * Strategic Lanes (the 3-lane grid) was retired 2026-05-21 in favor
 * of plays-as-cornerstone (Principle 12). The Call is now a single-
 * pick verdict on top, then the DecisionBoard: the same candidates
 * weighed from four angles (by lane, by tier/EV, by play, by path),
 * folding in the Tier Map + Draft Path Projector. The roster-wide
 * strategic frame still lives in the Plays panel.
 *
 * The component is a presentational shell over:
 *
 *   decision.recommendation                (standing call)
 *   decision.feel_weird_disclaimer         (counterintuitive lock)
 *   decision.quadrant_candidates           (standing call + alts)
 *   decision.plays_this_enables            (plays this pick enables)
 *   decision.why                           (landscape rationale)
 *   decision.next_picks_plan               (forward look)
 *   decision.scarcity_callout              (skip-cost line)
 *   decision.counter_view                  (dissenting frame)
 *   decision.trade_up_consideration        (or make a trade)
 *   decision.opponent_between_picks        (gap analysis)
 *
 * If the data model ripples through the engine, this component
 * automatically reflects it. No parallel implementations live here.
 */

import { useState } from "react";
import type { Decision } from "@/lib/strategy/decision-synthesis/types";
import type { DraftPathProjection } from "@/lib/strategy/draft-paths/types";
import type { TierMap as TierMapData } from "@/lib/engine/evaluation/tier-map";
import { DecisionBoard } from "./decision-board";
import { PlaysEnabledCallout } from "../plays-enabled-callout";

export type TheCallProps = {
  decision: Decision;
  tierMap: TierMapData | null;
  pathProjection: DraftPathProjection | null;
  leagueId: string;
};

export function TheCall({
  decision,
  tierMap,
  pathProjection,
  leagueId,
}: TheCallProps) {
  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border-2 border-accent/60"
      aria-label="The Call"
    >
      <Bridge decision={decision} />

      {decision.feel_weird_disclaimer && (
        <DisclaimerBand text={decision.feel_weird_disclaimer} />
      )}

      {decision.opponent_between_picks?.primary_opponent && (
        <OpponentGapLine
          ownerName={
            decision.opponent_between_picks.primary_opponent.owner_name
          }
          totalDemand={
            decision.opponent_between_picks.total_demand_by_position
          }
        />
      )}

      <DecisionBoard
        decision={decision}
        tierMap={tierMap}
        pathProjection={pathProjection}
        leagueId={leagueId}
      />

      {decision.plays_this_enables.length > 0 && (
        <PlaysEnabledCallout
          plays={decision.plays_this_enables}
          leagueId={leagueId}
          currentPickNo={decision.pick_no}
        />
      )}

      {decision.trade_up_consideration && (
        <TradeUpConsiderationBlock consideration={decision.trade_up_consideration} />
      )}

      {decision.scarcity_callout && (
        <ScarcityCallout text={decision.scarcity_callout} />
      )}

      {decision.counter_view && <CounterView counter={decision.counter_view} />}

      <WhyAndNext why={decision.why} nextPicks={decision.next_picks_plan} />

      <Footnote pickLabel={decision.pick_label} />
    </section>
  );
}

function Footnote({ pickLabel }: { pickLabel: string }) {
  return (
    <div className="px-5 py-3 border-t border-border-soft">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
        dynastygeneral.app · pick {pickLabel}
      </p>
    </div>
  );
}

function Bridge({ decision }: { decision: Decision }) {
  return (
    <header className="border-b border-border-soft px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          The Call
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          Pick {decision.pick_label}
        </span>
        {decision.picks_until_me === 0 ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-success">
            On the clock
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {decision.picks_until_me} pick
            {decision.picks_until_me === 1 ? "" : "s"} away
          </span>
        )}
      </div>
    </header>
  );
}

function DisclaimerBand({ text }: { text: string }) {
  // Disclaimer copy already begins "Counterintuitive lock." so no
  // band label is needed (and the prior "Hear me out" header was
  // Voice C drift that we explicitly rejected). The accent border
  // and background carry the visual emphasis.
  return (
    <div className="border-b border-warning/40 bg-warning/5 px-5 py-3">
      <p className="text-[12px] leading-snug text-foreground">{text}</p>
    </div>
  );
}


function OpponentGapLine({
  ownerName,
  totalDemand,
}: {
  ownerName: string | null;
  totalDemand: Record<string, number>;
}) {
  // Identify the position with the highest demand from the gap as
  // the most likely target. Per CANONICAL_SOURCES.md the demand
  // values come from analyzeOpponentsInGap; we read them as-is.
  const sortedPositions = Object.entries(totalDemand)
    .filter(([pos]) => ["QB", "RB", "WR", "TE"].includes(pos))
    .sort((a, b) => b[1] - a[1]);
  const topPos = sortedPositions[0]?.[0] ?? null;
  return (
    <div className="border-b border-border-soft px-5 py-3 bg-surface/40">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Between picks
      </div>
      <p className="mt-1 text-xs leading-snug text-foreground">
        {ownerName ?? "Next picker"} owns the gap.
        {topPos ? ` Likely targets ${topPos} first.` : ""}
      </p>
    </div>
  );
}

// Decision Quadrant moved to ./decision-quadrant.tsx; parked for the
// /pick deep-dive route. Founder feedback 2026-05-08: the chart "tells
// me nothing" without an interpretation headline. Stripped from the
// hub-rendered The Call surface; will return on the deep-dive with a
// real one-line interpretation above the scatter.


function ScarcityCallout({ text }: { text: string }) {
  return (
    <div className="border-b border-border-soft px-5 py-3 bg-surface/40">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
        If you skip
      </div>
      <p className="mt-1 text-xs leading-snug text-foreground">{text}</p>
    </div>
  );
}

function TradeUpConsiderationBlock({
  consideration,
}: {
  consideration: NonNullable<Decision["trade_up_consideration"]>;
}) {
  return (
    <div className="border-b border-accent/40 bg-accent/5 px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Or make a trade
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {consideration.position} · survival {consideration.survival_pct}%
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-foreground">
        {consideration.framing}
      </p>
      <a
        href="#coach-panel"
        className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:text-foreground transition-colors"
      >
        Plan a trade-up with Coach ↗
      </a>
    </div>
  );
}

function CounterView({
  counter,
}: {
  counter: NonNullable<Decision["counter_view"]>;
}) {
  return (
    <div className="border-b border-border-soft px-5 py-3 bg-warning/5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
        Dissent
      </div>
      <p className="mt-1 text-[12px] font-medium leading-snug text-foreground">
        {counter.headline}
      </p>
      <p className="mt-1 text-xs leading-snug text-muted">{counter.detail}</p>
    </div>
  );
}

function WhyAndNext({
  why,
  nextPicks,
}: {
  why: string[];
  nextPicks: Decision["next_picks_plan"];
}) {
  const [open, setOpen] = useState(false);
  if (why.length === 0 && nextPicks.length === 0) return null;
  return (
    <div className="px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} why this landscape + next picks
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {why.length > 0 && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 mb-2">
                Why this landscape
              </div>
              <ul className="space-y-1 text-xs leading-snug text-foreground">
                {why.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}
          {nextPicks.length > 0 && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 mb-2">
                Next picks plan
              </div>
              <ul className="space-y-2 text-xs leading-snug text-foreground">
                {nextPicks.map((np) => (
                  <li
                    key={np.pick_no}
                    className="flex items-baseline gap-3"
                  >
                    <span className="font-mono text-muted-2">{np.pick_label}</span>
                    <span>
                      {np.target_names.length > 0 ? (
                        <>
                          <span className="font-medium">
                            {np.target_names.join(" or ")}
                          </span>{" "}
                          <span className="text-muted-2">· {np.reason}</span>
                        </>
                      ) : (
                        <span className="text-muted-2">{np.reason}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
