/**
 * League Pulse panel. situational insights from the snapshot,
 * surfaced regardless of whether any archetype currently fits.
 *
 * Renders above the strategy board so even a Pick 1.5 user with one
 * roster pick gets actionable league-state context (format quirks,
 * QB pace, position runs in progress, your turn approaching, opening
 * previews).
 */

import type { Pulse, PulseSeverity } from "@/lib/strategy/pulse";

const SEVERITY_TONE: Record<
  PulseSeverity,
  { border: string; label: string; bg: string }
> = {
  critical: {
    border: "border-danger/60",
    label: "text-danger",
    bg: "bg-danger/5",
  },
  notable: {
    border: "border-accent/60",
    label: "text-accent",
    bg: "bg-accent/5",
  },
  info: {
    border: "border-border-soft",
    label: "text-muted-2",
    bg: "bg-surface",
  },
};

const SEVERITY_LABEL: Record<PulseSeverity, string> = {
  critical: "Critical",
  notable: "Notable",
  info: "Context",
};

export function LeaguePulse({ pulse }: { pulse: Pulse[] }) {
  if (pulse.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        League pulse
      </div>
      <div className="mt-1 text-sm text-muted">
        Live league-state insights. Updates as picks are made.
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {pulse.map((p) => (
          <PulseCard key={p.id} pulse={p} />
        ))}
      </div>
    </section>
  );
}

function PulseCard({ pulse }: { pulse: Pulse }) {
  const tone = SEVERITY_TONE[pulse.severity];
  return (
    <div
      className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.label}`}
        >
          {SEVERITY_LABEL[pulse.severity]} · {pulse.category.replace(/-/g, " ")}
        </span>
      </div>
      <h3 className="mt-1.5 text-base font-semibold text-foreground">
        {pulse.headline}
      </h3>
      <p className="mt-1 text-sm leading-snug text-muted">{pulse.body}</p>
      {pulse.stats && pulse.stats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-border-soft pt-2.5">
          {pulse.stats.map((s) => (
            <div key={s.label}>
              <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
                {s.label}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
