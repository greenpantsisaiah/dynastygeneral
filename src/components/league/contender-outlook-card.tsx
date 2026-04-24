/**
 * Contender Outlook card. 5-year per-year contender forecast plus
 * synthesis. Sits between WindowsBar and DecisionCard. Direction view
 * lives in WindowsBar; this is the quality + trajectory view.
 */

import type {
  ContenderOutlook,
  ContenderTier,
} from "@/lib/strategy/contender-outlook/types";
import {
  tierLabel,
  tierLabelFuzzy,
} from "@/lib/strategy/contender-outlook/types";

const TIER_TONE: Record<
  ContenderTier,
  { border: string; chip: string; bar: string }
> = {
  contender: {
    border: "border-success/60",
    chip: "text-success",
    bar: "bg-success/70",
  },
  bubble: {
    border: "border-accent/40",
    chip: "text-accent",
    bar: "bg-accent/60",
  },
  rebuild: {
    border: "border-border-strong",
    chip: "text-muted-2",
    bar: "bg-muted-2/50",
  },
};

function ScoreBar({ score, tier }: { score: number; tier: ContenderTier }) {
  const pct = Math.max(0, Math.min(100, score));
  const tone = TIER_TONE[tier];
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-sm bg-surface-2">
      <div
        className={`h-full ${tone.bar}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ContenderOutlookCard({
  outlook,
}: {
  outlook: ContenderOutlook;
}) {
  if (outlook.years.length === 0) return null;
  const peak = outlook.years.reduce(
    (best, y) => (y.score > best.score ? y : best),
    outlook.years[0],
  );
  const peakTone = TIER_TONE[peak.tier];

  return (
    <section
      className={`mt-8 rounded-lg border-2 ${peakTone.border} bg-surface px-5 py-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Contender outlook · {outlook.years.length} years
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Peak {peak.season} · {tierLabelFuzzy(peak.tier, peak.score)} (
            {peak.score}/100)
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Rebuild &lt;60 · Bubble 60-74 · Contender 75+
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {outlook.years.map((y) => {
          const tone = TIER_TONE[y.tier];
          return (
            <div
              key={y.season}
              className="grid grid-cols-[3rem_1fr_3rem_6rem] items-center gap-3 text-xs"
            >
              <span className="font-mono text-[11px] text-muted">
                {y.season}
              </span>
              <ScoreBar score={y.score} tier={y.tier} />
              <span className="text-right font-mono text-[11px] text-foreground">
                {y.score}
              </span>
              <span
                className={`text-right font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}
                title={tierLabelFuzzy(y.tier, y.score)}
              >
                {tierLabel(y.tier)}
                {y.tier === "contender" ? " ✓" : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-md border border-border-soft bg-surface-2 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          The take
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">
          {outlook.take}
        </p>
      </div>

      {outlook.protect_bullets.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            To protect the window
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-foreground">
            {outlook.protect_bullets.map((b, i) => (
              <li key={i}>· {b}</li>
            ))}
          </ul>
        </div>
      )}

    </section>
  );
}
