"use client";

/**
 * Shared play render bits: the urgency chip and the per-partner
 * survival list. Both surfaces that show live (uncommitted) plays
 * consume these so the founder sees real survival math per partner
 * instead of a flat "next 4 picks" window.
 */

import type { PlayPlayerRef, Urgency } from "@/lib/strategy/plays/types";
import { urgencyLabel } from "@/lib/strategy/plays/urgency";

export function PlayUrgencyChip({ urgency }: { urgency?: Urgency }) {
  if (!urgency) return null;
  const tone =
    urgency === "act_now"
      ? "border-danger/50 text-danger"
      : urgency === "this_round"
        ? "border-warning/50 text-warning"
        : "border-border-soft text-muted-2";
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${tone}`}
    >
      {urgencyLabel(urgency)}
    </span>
  );
}

function SurvivalBar({ pct }: { pct: number }) {
  const tone =
    pct < 25 ? "bg-danger" : pct < 50 ? "bg-warning" : "bg-accent";
  return (
    <span className="relative inline-block h-1.5 w-14 rounded-full bg-border-soft align-middle">
      <span
        className={`absolute left-0 top-0 h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/**
 * Per-partner survival readout. Each partner shows P(survives) to the
 * user's next pick with the demand-sensitivity band when one exists.
 * Renders nothing when no partner carries survival (no live gap).
 */
export function PartnerSurvivalList({
  partners,
}: {
  partners: PlayPlayerRef[];
}) {
  const haveSurvival = partners.some((p) => p.survival != null);
  if (!haveSurvival) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {partners.map((p) => (
        <li
          key={p.player_id}
          className="flex items-center justify-between gap-2 text-[11px]"
        >
          <span className="text-foreground">
            {p.name}{" "}
            <span className="text-muted-2">({p.position})</span>
          </span>
          {p.survival ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <SurvivalBar pct={p.survival.pct} />
              <span>
                {p.survival.pct}%
                {p.survival.ci_low !== p.survival.ci_high
                  ? ` (CI ${p.survival.ci_low}-${p.survival.ci_high}%)`
                  : ""}{" "}
                · {urgencyLabel(p.survival.urgency)}
              </span>
            </span>
          ) : (
            <span className="font-mono text-[10px] text-muted-2">
              survival n/a
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
