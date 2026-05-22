"use client";

/**
 * Standing Call. The per-pick hero for The Call after Strategic Lanes
 * was retired (founder direction 2026-05-21: plays are the cornerstone
 * strategic frame; The Call is a single-pick verdict, not a 3-lane
 * grid). REDESIGN_INTENTIONS.md Principle 12 + section inventory.
 *
 * Layout:
 *   1. Standing call hero (decision.recommendation), with a
 *      "Best EV available" badge when the call IS the raw-EV leader,
 *      or a transparency line naming the higher-EV alternative when it
 *      diverges (the engine weights survival + roster fit, so the pick
 *      can differ from raw EV).
 *   2. Best value on the board: the next 2-3 candidates by EV, so the
 *      raw-EV leader is always visible even when the call diverges.
 *
 * Reads canonical Decision data only. EV uses the same
 * (value/100) × (pick − ADP) formula as the EV bank, with a ±3-pick
 * ADP-noise envelope rendered inline (Principle 0 / 6).
 */

import { useEffect, useMemo, useState } from "react";
import type {
  Decision,
  DecisionQuadrantCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import { getActivePlayCommitments } from "@/lib/plays-storage";
import type { PlayCommitment } from "@/lib/strategy/plays/types";

const ADP_NOISE_PICKS = 3;

export type StandingCallProps = {
  decision: Decision;
  leagueId: string;
};

export function StandingCall({ decision, leagueId }: StandingCallProps) {
  const standingCallId = decision.recommendation.player_id;

  // Read active plays so the hero + alternatives can badge candidates
  // that advance a committed play (the STAY DISCIPLINED verb).
  const [activePlays, setActivePlays] = useState<PlayCommitment[]>([]);
  useEffect(() => {
    setActivePlays(getActivePlayCommitments(leagueId));
  }, [leagueId]);

  const advancesByPlayer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of activePlays) {
      for (const t of c.followthrough_targets) {
        const existing = m.get(t.player_id);
        if (existing) existing.push(c.play_name);
        else m.set(t.player_id, [c.play_name]);
      }
    }
    return m;
  }, [activePlays]);

  const withEv = decision.quadrant_candidates.map((c) => ({
    c,
    ev: computeEv(c, decision.pick_no),
  }));
  const standingCall =
    withEv.find((x) => x.c.player_id === standingCallId) ?? withEv[0] ?? null;
  if (!standingCall) return null;

  const ranked = withEv
    .filter((x) => x.ev != null)
    .sort((a, b) => (b.ev as number) - (a.ev as number));
  const bestEv = ranked[0] ?? null;
  const isBestEv = bestEv != null && bestEv.c.player_id === standingCallId;
  const bestValueAlts = ranked
    .filter((x) => x.c.player_id !== standingCallId)
    .slice(0, 3);

  return (
    <div className="px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-3">
        The Call
      </div>

      <div className="rounded-md border border-accent/60 bg-accent/5 px-4 py-4">
        {isBestEv ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-success border border-success/60 rounded-full px-1.5 py-0.5">
            Best EV available
          </span>
        ) : bestEv && bestEv.ev != null ? (
          <p className="text-[11px] leading-snug text-warning">
            Raw-EV leader: {bestEv.c.name} ({bestEv.ev >= 0 ? "+" : ""}
            {bestEv.ev.toFixed(1)}). The call weighs survival to your pick +
            roster fit; the raw-EV leader sits in best value below.
          </p>
        ) : null}
        <CandidateBlock
          candidate={standingCall.c}
          currentPickNo={decision.pick_no}
          isStandingCall
          advancesPlays={advancesByPlayer.get(standingCall.c.player_id) ?? []}
        />
      </div>

      {bestValueAlts.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2 mb-2">
            Best value on the board
          </div>
          <div className="space-y-3">
            {bestValueAlts.map((x) => (
              <div
                key={x.c.player_id}
                className="rounded-md border border-border-soft bg-surface/30 px-4 py-3"
              >
                <CandidateBlock
                  candidate={x.c}
                  currentPickNo={decision.pick_no}
                  isStandingCall={false}
                  advancesPlays={advancesByPlayer.get(x.c.player_id) ?? []}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Per-candidate block (hero or best-value alt)
 * ============================================================ */

function CandidateBlock({
  candidate,
  currentPickNo,
  isStandingCall,
  advancesPlays = [],
  compact = false,
}: {
  candidate: DecisionQuadrantCandidate;
  currentPickNo: number;
  isStandingCall: boolean;
  advancesPlays?: string[];
  compact?: boolean;
}) {
  const ev = computeEv(candidate, currentPickNo);
  const evLow = computeEvShifted(candidate, currentPickNo, ADP_NOISE_PICKS);
  const evHigh = computeEvShifted(candidate, currentPickNo, -ADP_NOISE_PICKS);
  const evColor =
    ev == null ? "text-muted-2" : ev >= 0 ? "text-success" : "text-danger";
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
        <div
          className={`${compact ? "text-[13px]" : "text-[15px]"} font-semibold leading-tight text-foreground truncate`}
        >
          {candidate.name}
        </div>
        {ev != null && (
          <div
            className={`shrink-0 font-mono ${compact ? "text-[12px]" : "text-[16px]"} font-semibold ${evColor} leading-none`}
          >
            {ev >= 0 ? "+" : ""}
            {ev.toFixed(1)}
          </div>
        )}
      </div>

      {advancesPlays.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {advancesPlays.map((playName) => (
            <span
              key={playName}
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent border border-accent/50 rounded-full px-1.5 py-0.5"
              title={`This candidate advances your active play: ${playName}`}
            >
              Advances · {playName}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-[10px] text-muted">
        <span>
          {candidate.position}
          {candidate.team ? `-${candidate.team}` : ""}
        </span>
        {candidate.age != null && <span>age {candidate.age}</span>}
        {candidate.adp != null && <span>ADP {Math.round(candidate.adp)}</span>}
        {candidate.value != null && (
          <span>
            value {Math.round(candidate.value)}
            {candidate.ktc_overall_rank != null && (
              <span className="text-muted-2"> (#{candidate.ktc_overall_rank})</span>
            )}
          </span>
        )}
      </div>

      {/* CI inline + survival, per the always-on density rule. */}
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
    </div>
  );
}

/**
 * "Your dials are pushing this pick" chip. Surfaces the top 3 dial
 * influences so the user sees which tuned dials prop up the call.
 * Echoes the per-row "Why" panel on /rankings, kept tight for the
 * mid-draft reader.
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
