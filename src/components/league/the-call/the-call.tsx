"use client";

/**
 * The Call. Per-pick canonical surface for the redesigned hub.
 *
 * Replaces the legacy <DecisionCard> as the standing-call surface.
 * Renders mobile-first, single-column. Voice A throughout; Voice B
 * accents activate when the user has flipped Sloan mode (CIs and
 * provenance surface inline, same data).
 *
 * Critical constraint: this component reads canonical data only. No
 * EV math, no survival math, no lane definitions are recomputed
 * here. The component is a presentational shell over:
 *
 *   decision.recommendation                (standing call)
 *   decision.feel_weird_disclaimer         (counterintuitive lock)
 *   decision.top_candidates                (lane primaries + alts)
 *   decision.quadrant_candidates           (hero scatter dots)
 *   decision.why                           (landscape rationale)
 *   decision.next_picks_plan               (forward look)
 *   decision.scarcity_callout              (skip-cost line)
 *   decision.counter_view                  (dissenting frame)
 *   decision.window_frame                  (build context)
 *   decision.opponent_between_picks        (gap analysis)
 *
 * Computed once per render via canonical helpers:
 *   computeWhatIfReadout(...)  per-candidate EV delta vs the lean
 *   laneDefinitionsForFormat() format-aware lane labels
 *
 * If the data model ripples through the engine, this component
 * automatically reflects it. No parallel implementations live here.
 */

import { useMemo, useState } from "react";
import type { Decision, DecisionTopCandidate } from "@/lib/strategy/decision-synthesis/types";
import { computeWhatIfReadout } from "@/lib/strategy/decision-synthesis/whatif";
import {
  laneDefinitionsForFormat,
  type LaneDefinition,
} from "@/lib/engine/build-trajectory";
import { useSloanMode } from "@/lib/sloan-mode/use-sloan-mode";

export type TheCallProps = {
  decision: Decision;
  leagueType: "dynasty" | "keeper" | "redraft" | "unknown";
  maxKeepers: number | null;
};

export function TheCall({ decision, leagueType, maxKeepers }: TheCallProps) {
  const { mode, toggle, isLoaded } = useSloanMode();
  const lanes = useMemo(
    () => laneDefinitionsForFormat(leagueType, maxKeepers),
    [leagueType, maxKeepers],
  );
  const whatif = useMemo(
    () =>
      computeWhatIfReadout({
        standingCallId: decision.recommendation.player_id,
        candidates: decision.top_candidates,
        currentPickNo: decision.pick_no,
      }),
    [decision.recommendation.player_id, decision.top_candidates, decision.pick_no],
  );

  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border-2 border-accent/60"
      aria-label="The Call"
    >
      <Bridge
        decision={decision}
        sloanOn={mode === "on"}
        onToggleSloan={() => void toggle()}
        sloanLoaded={isLoaded}
      />

      {decision.feel_weird_disclaimer && (
        <DisclaimerBand text={decision.feel_weird_disclaimer} />
      )}

      <StandingCallHero
        decision={decision}
        whatifEv={whatif.standing_call_ev}
        sloanOn={mode === "on"}
      />

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

      <DecisionQuadrant
        candidates={decision.quadrant_candidates}
        leanId={decision.recommendation.player_id}
        sloanOn={mode === "on"}
      />

      <LaneStack
        lanes={lanes}
        candidates={decision.top_candidates}
        whatifEntries={whatif.entries}
        sloanOn={mode === "on"}
      />

      {decision.scarcity_callout && (
        <ScarcityCallout text={decision.scarcity_callout} />
      )}

      {decision.counter_view && <CounterView counter={decision.counter_view} />}

      <WhyAndNext
        why={decision.why}
        nextPicks={decision.next_picks_plan}
      />
    </section>
  );
}

function Bridge({
  decision,
  sloanOn,
  onToggleSloan,
  sloanLoaded,
}: {
  decision: Decision;
  sloanOn: boolean;
  onToggleSloan: () => void;
  sloanLoaded: boolean;
}) {
  const wf = decision.window_frame;
  return (
    <header className="border-b border-border-soft px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            The Call
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            Pick {decision.pick_label}
          </span>
          {decision.picks_until_me === 0 ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-success">
              On the clock
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              {decision.picks_until_me} pick
              {decision.picks_until_me === 1 ? "" : "s"} away
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleSloan}
          disabled={!sloanLoaded}
          className={`font-mono text-[9px] uppercase tracking-[0.18em] rounded-full border px-2 py-0.5 transition-colors ${
            sloanOn
              ? "border-accent text-accent bg-accent/10"
              : "border-border-strong text-muted-2 hover:text-foreground"
          }`}
          title="Sloan mode: confidence intervals and model provenance surface inline. Same data, different reading register."
        >
          Sloan {sloanOn ? "on" : "off"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-2">
        <span className="font-mono uppercase tracking-[0.14em] text-accent mr-2">
          Build
        </span>
        {wf.label}. {wf.sentence}
      </p>
    </header>
  );
}

function DisclaimerBand({ text }: { text: string }) {
  return (
    <div className="border-b border-warning/40 bg-warning/5 px-5 py-3">
      <div className="flex items-start gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-warning shrink-0 mt-0.5">
          Hear me out
        </span>
        <p className="text-[12px] leading-snug text-foreground">{text}</p>
      </div>
    </div>
  );
}

function StandingCallHero({
  decision,
  whatifEv,
  sloanOn,
}: {
  decision: Decision;
  whatifEv: number | null;
  sloanOn: boolean;
}) {
  const r = decision.recommendation;
  const evDisplay =
    whatifEv == null
      ? null
      : whatifEv >= 0
        ? `+${whatifEv.toFixed(1)} EV`
        : `${whatifEv.toFixed(1)} EV`;
  const evColor =
    whatifEv == null
      ? "text-muted-2"
      : whatifEv >= 0
        ? "text-success"
        : "text-danger";
  return (
    <div className="px-5 py-5 border-b border-border-soft">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Standing call
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {r.rule.replace(/_/g, " ")}
        </div>
      </div>
      <h2 className="mt-2 text-2xl font-semibold leading-tight text-foreground">
        {r.name}
      </h2>
      <div className="mt-1 flex flex-wrap items-baseline gap-3 font-mono text-[11px] text-muted">
        <span>
          {r.position}
          {r.team ? `-${r.team}` : ""}
        </span>
        {r.age != null && <span>age {r.age}</span>}
        {r.adp != null && (
          <span>ADP {Math.round(r.adp)}</span>
        )}
        {r.value != null && (
          <span>
            value {Math.round(r.value)}
            {sloanOn && r.ktc_overall_rank != null && (
              <span className="text-muted-2">
                {" "}
                (KTC #{r.ktc_overall_rank})
              </span>
            )}
          </span>
        )}
        {evDisplay && (
          <span className={`font-semibold ${evColor}`}>{evDisplay}</span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        {r.primary_reason}
      </p>
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

function DecisionQuadrant({
  candidates,
  leanId,
  sloanOn,
}: {
  candidates: Decision["quadrant_candidates"];
  leanId: string;
  sloanOn: boolean;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = candidates.find((c) => c.player_id === hoveredId) ?? null;
  if (candidates.length === 0) return null;

  // SVG layout: 100x100 viewBox with margins. Center axis at (50, 50).
  // Horizon: -100..+100 mapped to 5..95 (5% margin). Confidence:
  // 0..100 mapped to 95..5 (inverted; high confidence at top).
  const xOf = (h: number) => 5 + ((h + 100) / 200) * 90;
  const yOf = (c: number) => 95 - (c / 100) * 90;

  return (
    <div className="px-5 py-5 border-b border-border-soft">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Decision Quadrant
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {candidates.length} candidates
        </div>
      </div>
      <div className="relative w-full" style={{ aspectRatio: "1 / 1", maxWidth: "320px" }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          role="img"
          aria-label="Decision Quadrant scatter"
        >
          {/* Quadrant grid */}
          <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.3" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.3" />
          {/* Outer frame */}
          <rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.3" />
          {candidates.map((c) => {
            const cx = xOf(c.horizon_pct);
            const cy = yOf(c.confidence_pct);
            const isLean = c.player_id === leanId;
            const isHovered = c.player_id === hoveredId;
            const fillColor = laneFillFor(c.timeline_lane);
            return (
              <g key={c.player_id}>
                {isLean && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.7"
                    strokeWidth="0.5"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? "2.8" : "2.2"}
                  fill={fillColor}
                  stroke={isHovered ? "currentColor" : "none"}
                  strokeWidth={isHovered ? "0.4" : "0"}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredId(c.player_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setHoveredId(c.player_id)}
                />
              </g>
            );
          })}
        </svg>
        {/* Axis labels */}
        <div className="absolute left-1 top-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-2">
          High conf
        </div>
        <div className="absolute left-1 bottom-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-2">
          Low conf
        </div>
        <div className="absolute right-1 bottom-1 font-mono text-[8px] uppercase tracking-[0.14em] text-success/80">
          Future →
        </div>
        <div className="absolute left-1 bottom-3 font-mono text-[8px] uppercase tracking-[0.14em] text-warning/80">
          ← Win-now
        </div>
      </div>
      {hovered && (
        <div className="mt-3 rounded-md border border-border-strong bg-surface px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">
              {hovered.name}
            </span>
            <span className="font-mono text-[10px] text-muted-2">
              {laneShortLabelFor(hovered.timeline_lane)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">
            horizon {Math.round(hovered.horizon_pct)}, conf{" "}
            {Math.round(hovered.confidence_pct)}
            {sloanOn && hovered.constraint_note && (
              <span className="block mt-1 text-warning">
                {hovered.constraint_note}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-foreground">
            {hovered.primary_reason}
          </p>
        </div>
      )}
      {!hovered && (
        <p className="mt-3 text-[11px] leading-snug text-muted-2">
          Tap a dot for the candidate&apos;s rationale. Outer ring marks the
          standing call. Color marks the timeline lane.
        </p>
      )}
    </div>
  );
}

function laneFillFor(lane: "win-now" | "balanced" | "future"): string {
  switch (lane) {
    case "win-now":
      return "rgb(var(--color-warning))";
    case "balanced":
      return "rgb(var(--color-foreground))";
    case "future":
      return "rgb(var(--color-success))";
  }
}

function laneShortLabelFor(lane: "win-now" | "balanced" | "future"): string {
  switch (lane) {
    case "win-now":
      return "Win-Now";
    case "balanced":
      return "Balanced";
    case "future":
      return "Future";
  }
}

function LaneStack({
  lanes,
  candidates,
  whatifEntries,
  sloanOn,
}: {
  lanes: LaneDefinition[];
  candidates: DecisionTopCandidate[];
  whatifEntries: ReturnType<typeof computeWhatIfReadout>["entries"];
  sloanOn: boolean;
}) {
  const byLane = new Map<string, DecisionTopCandidate[]>();
  for (const c of candidates) {
    const list = byLane.get(c.timeline_lane);
    if (list) list.push(c);
    else byLane.set(c.timeline_lane, [c]);
  }
  const whatifById = new Map(
    whatifEntries.map((e) => [e.player_id, e]),
  );
  return (
    <div className="border-b border-border-soft px-5 py-5 space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Lanes
      </div>
      {lanes.map((lane) => {
        const inLane = byLane.get(lane.id) ?? [];
        if (inLane.length === 0) return null;
        const primary = inLane[0];
        const alts = inLane.slice(1);
        return (
          <LaneCard
            key={lane.id}
            lane={lane}
            primary={primary}
            alts={alts}
            whatifById={whatifById}
            sloanOn={sloanOn}
          />
        );
      })}
    </div>
  );
}

function LaneCard({
  lane,
  primary,
  alts,
  whatifById,
  sloanOn,
}: {
  lane: LaneDefinition;
  primary: DecisionTopCandidate;
  alts: DecisionTopCandidate[];
  whatifById: Map<string, ReturnType<typeof computeWhatIfReadout>["entries"][number]>;
  sloanOn: boolean;
}) {
  const toneBorder =
    lane.tone === "warning"
      ? "border-warning/40"
      : lane.tone === "success"
        ? "border-success/40"
        : "border-border-strong";
  const toneText =
    lane.tone === "warning"
      ? "text-warning"
      : lane.tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div className={`rounded-md border ${toneBorder} bg-surface/50 px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${toneText}`}>
          {lane.label}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {lane.blurb}
        </div>
      </div>
      <CandidateRow candidate={primary} whatifById={whatifById} sloanOn={sloanOn} primary />
      {alts.map((c) => (
        <CandidateRow
          key={c.player_id}
          candidate={c}
          whatifById={whatifById}
          sloanOn={sloanOn}
        />
      ))}
    </div>
  );
}

function CandidateRow({
  candidate,
  whatifById,
  sloanOn,
  primary,
}: {
  candidate: DecisionTopCandidate;
  whatifById: Map<string, ReturnType<typeof computeWhatIfReadout>["entries"][number]>;
  sloanOn: boolean;
  primary?: boolean;
}) {
  const whatif = whatifById.get(candidate.player_id);
  const survivalLabel = candidate.availability_next_pick
    ? candidate.availability_next_pick.replace("_", " ")
    : null;
  const survivalColor =
    candidate.availability_next_pick === "likely_here"
      ? "text-success"
      : candidate.availability_next_pick === "coin_flip"
        ? "text-warning"
        : candidate.availability_next_pick === "probably_gone"
          ? "text-danger"
          : "text-muted-2";
  return (
    <div className={primary ? "mt-3" : "mt-3 pt-3 border-t border-border-soft"}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[14px] font-semibold text-foreground">
          {candidate.name}
          {candidate.is_lean && (
            <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
              lean
            </span>
          )}
        </div>
        {whatif?.delta_vs_standing_call != null && !candidate.is_lean && (
          <div
            className={`font-mono text-[11px] font-semibold ${
              whatif.delta_vs_standing_call > 0
                ? "text-success"
                : whatif.delta_vs_standing_call < 0
                  ? "text-danger"
                  : "text-muted-2"
            }`}
          >
            {whatif.delta_vs_standing_call >= 0 ? "+" : ""}
            {whatif.delta_vs_standing_call.toFixed(1)} EV vs lean
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-3 font-mono text-[10px] text-muted">
        <span>
          {candidate.position}
          {candidate.team ? `-${candidate.team}` : ""}
        </span>
        {candidate.age != null && <span>age {candidate.age}</span>}
        {candidate.adp != null && (
          <span>ADP {Math.round(candidate.adp)}</span>
        )}
        {candidate.value != null && (
          <span>value {Math.round(candidate.value)}</span>
        )}
        {survivalLabel && candidate.survival_pct != null && (
          <span className={survivalColor}>
            {survivalLabel} {candidate.survival_pct}%
          </span>
        )}
      </div>
      {sloanOn && candidate.opponent_signal?.note && (
        <p className="mt-1 text-[11px] leading-snug text-muted-2">
          {candidate.opponent_signal.note}
        </p>
      )}
      {whatif && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {whatif.narrative}
        </p>
      )}
    </div>
  );
}

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
                      <span className="font-medium">
                        {np.target_names.join(" or ")}
                      </span>{" "}
                      <span className="text-muted-2">· {np.reason}</span>
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
