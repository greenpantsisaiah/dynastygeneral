/**
 * Shared candidate rendering for the Decision Board angles. Extracted
 * from the retired standing-call.tsx so the By-Lane, By-Tier/EV, and
 * By-Play angles all render a candidate the same way (EV + CI +
 * survival + Advances chips + dial influences).
 *
 * EV uses the same (value/100) x (pick - ADP) formula as the EV bank,
 * with a +/-3-pick ADP-noise envelope (Principle 0 / 6).
 */

import type { DecisionQuadrantCandidate } from "@/lib/strategy/decision-synthesis/types";

export const ADP_NOISE_PICKS = 3;

export function computeEv(
  c: DecisionQuadrantCandidate,
  currentPickNo: number,
): number | null {
  if (typeof c.value !== "number" || typeof c.adp !== "number") return null;
  return round2((c.value / 100) * (currentPickNo - c.adp));
}

export function computeEvShifted(
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

export function CandidateBlock({
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
              title={`Advances your active play: ${playName}`}
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

export function DialInfluenceChip({
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
