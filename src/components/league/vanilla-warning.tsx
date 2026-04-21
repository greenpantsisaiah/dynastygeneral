/**
 * Vanilla / Dynasty Purgatory warning panel. Renders above the strategy
 * board when the user is drifting toward the middle without committing
 * to any path. Severity tiers: info (early, balance is fine) →
 * warning (3+ picks, low drift) → critical (5+ picks, almost no drift).
 *
 * Quote-driven: each render shows a verbatim warning from a credible
 * dynasty voice so the urgency feels grounded, not invented.
 */

import type {
  VanillaWarning,
  VanillaWarningSeverity,
} from "@/lib/strategy/vanilla-warning/detect";

const SEVERITY_TONE: Record<
  VanillaWarningSeverity,
  { border: string; bg: string; label: string; chip: string }
> = {
  info: {
    border: "border-border-soft",
    bg: "bg-surface",
    label: "text-muted-2",
    chip: "Note",
  },
  warning: {
    border: "border-accent/60",
    bg: "bg-accent/10",
    label: "text-accent",
    chip: "Warning",
  },
  critical: {
    border: "border-danger/60",
    bg: "bg-danger/10",
    label: "text-danger",
    chip: "Critical · Dynasty Purgatory",
  },
};

export function VanillaWarningPanel({
  warning,
}: {
  warning: VanillaWarning;
}) {
  const tone = SEVERITY_TONE[warning.severity];
  return (
    <section
      className={`mt-8 rounded-lg border ${tone.border} ${tone.bg} px-5 py-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${tone.label}`}
        >
          {tone.chip}
        </span>
      </div>
      <h2 className="mt-2 text-xl font-semibold text-foreground">
        {warning.headline}
      </h2>
      <p className="mt-2 text-sm leading-snug text-muted">{warning.body}</p>

      {warning.diagnostic.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {warning.diagnostic.map((d, i) => (
            <li key={i}>· {d}</li>
          ))}
        </ul>
      )}

      {warning.quote.text && (
        <blockquote
          className={`mt-4 border-l-2 ${tone.border} pl-4 py-1 text-sm italic text-foreground`}
        >
          &ldquo;{warning.quote.text}&rdquo;
          <footer className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-2 not-italic">
           . {warning.quote.attribution}
            {warning.quote.source_label ? `, ${warning.quote.source_label}` : ""}
          </footer>
        </blockquote>
      )}
    </section>
  );
}
