/**
 * Same-Path Threats card. Shows the top 3 opponents most likely
 * competing for the user's path's primary position + posture.
 *
 * Free tier: names + structural reason ("already 2 RBs", "same
 * posture"). Future Pro hook: "Get intel on this opponent" button
 * that runs an LLM read of their roster + likely next moves.
 *
 * Per founder note 2026-04-24: "I can get updates/intel on 1 of
 * them, or all of them." This is the v1 surface; per-opponent intel
 * is the natural next billing handle.
 */

import type { SamePathThreats } from "@/lib/strategy/same-path-threats/build";

const TIER_TONE = {
  primary: { border: "border-danger/60", chip: "text-danger", label: "PRIMARY THREAT" },
  watch: { border: "border-warning/60", chip: "text-warning", label: "WATCH" },
  potential: { border: "border-border-strong", chip: "text-muted-2", label: "POTENTIAL" },
} as const;

export function SamePathThreatsCard({
  threats,
}: {
  threats: SamePathThreats;
}) {
  if (threats.threats.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border-2 border-border-strong bg-surface px-5 py-5">
      <header>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Same-path threats · {threats.threats.length}
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          Who else is chasing {threats.archetype_name}?
        </h2>
        <p className="mt-1 text-xs text-muted">
          Opponents whose roster shape or posture overlaps with your
          path. They'll likely compete for the same players + tier.
        </p>
      </header>

      <div className="mt-4 space-y-2">
        {threats.threats.map((t) => {
          const tone = TIER_TONE[t.tier];
          return (
            <div
              key={t.roster_id}
              className={`rounded-md border ${tone.border} bg-surface-2 px-4 py-3`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}
                  >
                    {tone.label}
                  </span>
                  <span className="text-base font-semibold text-foreground">
                    {t.owner_name}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-muted-2">
                  {t.score}/100
                </span>
              </div>
              {t.reasons.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {t.reasons.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.14em] font-mono text-muted-2">
        Per-opponent deeper intel (next-pick prediction, trade lanes,
        roster age) is coming next. Want it sooner? Use Coach: "give
        me intel on {threats.threats[0]?.owner_name}'s roster."
      </p>
    </section>
  );
}
