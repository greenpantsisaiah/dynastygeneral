"use client";

/**
 * Strategic Lanes. The active-draft hero per REDESIGN_INTENTIONS.md
 * (Strategic Lanes section, locked 2026-05-08 PM).
 *
 * Founder direction:
 *   "I preferred some earlier panels that had 3 picks if going this
 *    way, that way, the other way. Really helped me think. Design
 *    has drifted to THE ONE PICK."
 *
 * 2-3 lanes shown side-by-side (vertical stack on mobile). Each lane
 * is a strategic path with its own primary candidate, EV chip with
 * CI inline, and a "why this path" line. One lane carries the
 * "THE CALL" badge for the engine's overall lean. The standalone
 * standing-call hero is retired; the lean is identified inside its
 * lane.
 *
 * Format-aware (per laneDefinitionsForFormat):
 * - Dynasty / high-keeper: Win-Now / Balanced / Future
 * - Keeper low (max <= 4): Win-Now / Trade-Flex / Keeper-Lock
 * - Redraft: Lock / Ceiling / Depth
 *
 * Reads canonical Decision data only. EV math computed inline using
 * the same (value/100) × (pick − ADP) formula as the EV bank, with
 * a ±3-pick ADP-noise envelope for the CI band rendered inline next
 * to every number (per principle 0: MIT-grade statistical floor).
 */

import { useState } from "react";
import type {
  Decision,
  DecisionQuadrantCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import {
  laneDefinitionsForFormat,
  type LaneDefinition,
} from "@/lib/engine/build-trajectory";

const ADP_NOISE_PICKS = 3;

export type StrategicLanesProps = {
  decision: Decision;
  leagueType: "dynasty" | "keeper" | "redraft" | "unknown";
  maxKeepers: number | null;
};

export function StrategicLanes({
  decision,
  leagueType,
  maxKeepers,
}: StrategicLanesProps) {
  const lanes = laneDefinitionsForFormat(leagueType, maxKeepers);
  const standingCallId = decision.recommendation.player_id;

  // Group quadrant candidates by timeline lane. Quadrant has more
  // depth than top_candidates so each lane usually has at least one
  // entry to surface.
  const byLane = new Map<string, DecisionQuadrantCandidate[]>();
  for (const c of decision.quadrant_candidates) {
    const list = byLane.get(c.timeline_lane);
    if (list) list.push(c);
    else byLane.set(c.timeline_lane, [c]);
  }

  return (
    <div className="px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-3">
        Strategic Lanes
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lanes.map((lane) => {
          const inLane = byLane.get(lane.id) ?? [];
          const hasStandingCall = inLane.some(
            (c) => c.player_id === standingCallId,
          );
          return (
            <LaneCard
              key={lane.id}
              lane={lane}
              candidates={inLane}
              isStandingCallHere={hasStandingCall}
              standingCallId={standingCallId}
              currentPickNo={decision.pick_no}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * Per-lane card
 * ============================================================ */

function LaneCard({
  lane,
  candidates,
  isStandingCallHere,
  standingCallId,
  currentPickNo,
}: {
  lane: LaneDefinition;
  candidates: DecisionQuadrantCandidate[];
  isStandingCallHere: boolean;
  standingCallId: string;
  currentPickNo: number;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const primary = candidates[0] ?? null;
  const alts = candidates.slice(1, 3);
  const toneClass = TONE_CLASSES[lane.tone];

  if (!primary) {
    return (
      <div
        className={`rounded-md border ${toneClass.borderMuted} bg-surface/30 px-4 py-4 min-h-[180px]`}
      >
        <LaneHeader
          lane={lane}
          toneClass={toneClass}
          isStandingCallHere={false}
        />
        <p className="mt-3 text-[12px] leading-snug text-muted-2">
          No {lane.label.toLowerCase()} candidate ranked among the top
          12 right now.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border ${
        isStandingCallHere ? toneClass.borderEmphasis : toneClass.borderMuted
      } ${
        isStandingCallHere ? toneClass.bgEmphasis : "bg-surface/30"
      } px-4 py-4`}
    >
      <LaneHeader
        lane={lane}
        toneClass={toneClass}
        isStandingCallHere={isStandingCallHere}
      />
      <CandidateBlock
        candidate={primary}
        currentPickNo={currentPickNo}
        isStandingCall={primary.player_id === standingCallId}
      />

      {alts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-soft">
          <button
            type="button"
            onClick={() => setShowAlts((s) => !s)}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={showAlts}
          >
            {showAlts ? "Hide" : "Show"} {alts.length} alt
            {alts.length === 1 ? "" : "s"} in this lane
          </button>
          {showAlts && (
            <div className="mt-3 space-y-3">
              {alts.map((c) => (
                <CandidateBlock
                  key={c.player_id}
                  candidate={c}
                  currentPickNo={currentPickNo}
                  isStandingCall={c.player_id === standingCallId}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LaneHeader({
  lane,
  toneClass,
  isStandingCallHere,
}: {
  lane: LaneDefinition;
  toneClass: ToneClass;
  isStandingCallHere: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${toneClass.text}`}
        >
          {lane.label}
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-2 line-clamp-2">
          {lane.blurb}
        </p>
      </div>
      {isStandingCallHere && (
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.18em] text-accent border border-accent/60 rounded-full px-1.5 py-0.5">
          The call
        </span>
      )}
    </div>
  );
}

/* ============================================================
 * Per-candidate block (primary or alt)
 * ============================================================ */

function CandidateBlock({
  candidate,
  currentPickNo,
  isStandingCall,
  compact = false,
}: {
  candidate: DecisionQuadrantCandidate;
  currentPickNo: number;
  isStandingCall: boolean;
  compact?: boolean;
}) {
  const ev = computeEv(candidate, currentPickNo);
  const evLow = computeEvShifted(candidate, currentPickNo, ADP_NOISE_PICKS);
  const evHigh = computeEvShifted(candidate, currentPickNo, -ADP_NOISE_PICKS);
  const evColor =
    ev == null
      ? "text-muted-2"
      : ev >= 0
        ? "text-success"
        : "text-danger";
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
    <div className={compact ? "" : "mt-3"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className={`${compact ? "text-[13px]" : "text-[15px]"} font-semibold leading-tight text-foreground truncate`}>
          {candidate.name}
        </div>
        {ev != null && (
          <div className={`shrink-0 font-mono ${compact ? "text-[12px]" : "text-[16px]"} font-semibold ${evColor} leading-none`}>
            {ev >= 0 ? "+" : ""}
            {ev.toFixed(1)}
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-[10px] text-muted">
        <span>
          {candidate.position}
          {candidate.team ? `-${candidate.team}` : ""}
        </span>
        {candidate.age != null && <span>age {candidate.age}</span>}
        {candidate.adp != null && (
          <span>ADP {Math.round(candidate.adp)}</span>
        )}
        {candidate.value != null && (
          <span>
            value {Math.round(candidate.value)}
            {candidate.ktc_overall_rank != null && (
              <span className="text-muted-2">
                {" "}
                (#{candidate.ktc_overall_rank})
              </span>
            )}
          </span>
        )}
      </div>

      {/* CI inline + survival, both per the always-on density rule. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-3 font-mono text-[10px]">
        {ev != null && evLow != null && evHigh != null && (
          <span className="text-muted-2">
            EV CI {evLow >= 0 ? "+" : ""}
            {evLow.toFixed(1)} to {evHigh >= 0 ? "+" : ""}
            {evHigh.toFixed(1)}
          </span>
        )}
        {survivalLabel && candidate.survival_pct != null && (
          <span className={survivalColor}>
            {survivalLabel} {candidate.survival_pct}%
          </span>
        )}
      </div>

      {!compact && (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {candidate.primary_reason}
        </p>
      )}

      {!compact && isStandingCall && (
        <DialInfluenceChip
          influences={candidate.dial_influences ?? []}
          playerId={candidate.player_id}
        />
      )}

      {!compact && isStandingCall && (
        <p className="mt-2 text-[10px] leading-snug text-accent font-mono uppercase tracking-[0.14em]">
          ↑ Engine's lean if you must pick one
        </p>
      )}
    </div>
  );
}

/**
 * "Your dials are pushing this pick" chip. Surfaces the top 3
 * dial influences from the synthesis layer so the user can see, in
 * one line, which of their tuned dials are propping up the standing
 * call. Echoes the per-row "Why" panel on /rankings; for the
 * Decision card we keep it tight because users are time-pressed
 * mid-draft.
 */
function DialInfluenceChip({
  influences,
  playerId,
}: {
  influences: NonNullable<DecisionQuadrantCandidate["dial_influences"]>;
  playerId: string;
}) {
  const deepLink = `/rankings?player=${encodeURIComponent(playerId)}`;
  if (influences.length === 0) {
    return (
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
        Dials neutral · pick stands on the engine's default doctrine ·{" "}
        <a
          href={deepLink}
          className="underline decoration-dotted hover:text-accent"
        >
          see breakdown
        </a>
      </p>
    );
  }
  const top = [...influences]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  return (
    <div
      className="mt-2 rounded-sm border border-[color:#a78bfa]/40 bg-[color:#a78bfa]/5 px-2 py-1"
      title="Top dial influences from /rankings. Each delta is in score units, signed."
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:#a78bfa]">
          Your dials on this pick
        </div>
        <a
          href={deepLink}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:#a78bfa] underline decoration-dotted hover:text-accent"
        >
          See full breakdown →
        </a>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-foreground">
        {top.map((inf) => {
          const sign = inf.delta >= 0 ? "+" : "";
          const tone = inf.delta >= 0 ? "text-success" : "text-danger";
          return (
            <span key={inf.dial}>
              {inf.label}
              <span className={`ml-0.5 ${tone}`}>
                ({sign}
                {inf.delta.toFixed(1)})
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * EV math (mirrors EvBank canonical formula)
 * ============================================================ */

function computeEv(
  c: DecisionQuadrantCandidate,
  currentPickNo: number,
): number | null {
  if (typeof c.value !== "number" || typeof c.adp !== "number") return null;
  return round2((c.value / 100) * (currentPickNo - c.adp));
}

function computeEvShifted(
  c: DecisionQuadrantCandidate,
  currentPickNo: number,
  shift: number,
): number | null {
  if (typeof c.value !== "number" || typeof c.adp !== "number") return null;
  return round2((c.value / 100) * (currentPickNo - (c.adp + shift)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ============================================================
 * Tone classes per lane
 * ============================================================ */

type ToneClass = {
  borderMuted: string;
  borderEmphasis: string;
  bgEmphasis: string;
  text: string;
};

const TONE_CLASSES: Record<LaneDefinition["tone"], ToneClass> = {
  warning: {
    borderMuted: "border-warning/30",
    borderEmphasis: "border-warning/70",
    bgEmphasis: "bg-warning/5",
    text: "text-warning",
  },
  neutral: {
    borderMuted: "border-border-strong",
    borderEmphasis: "border-accent/60",
    bgEmphasis: "bg-accent/5",
    text: "text-foreground",
  },
  success: {
    borderMuted: "border-success/30",
    borderEmphasis: "border-success/70",
    bgEmphasis: "bg-success/5",
    text: "text-success",
  },
};
