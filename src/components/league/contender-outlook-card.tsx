/**
 * Contender Outlook card. 5-year per-year contender forecast plus
 * synthesis. Sits between WindowsBar and DecisionCard. Direction view
 * lives in WindowsBar; this is the quality + trajectory view.
 */

import type {
  ConfidenceStage,
  ContenderOutlook,
  ContenderTier,
} from "@/lib/strategy/contender-outlook/types";
import {
  tierLabel,
  tierLabelFuzzy,
} from "@/lib/strategy/contender-outlook/types";

// Stage-conditional copy. The auditor framework flags conclusive tier
// labels as false precision below pick 5; per-year tier chips and the
// header use these to soften framing accordingly.
const STAGE_HEADER: Record<ConfidenceStage, string> = {
  forming: "Outlook forming",
  trending: "Trending read",
  provisional: "Provisional read",
  earned: "Outlook",
};

function softTierLabel(tier: ContenderTier, stage: ConfidenceStage): string {
  const base = tierLabel(tier);
  if (stage === "forming") return "...";
  if (stage === "trending") return `trending ${base.toLowerCase()}`;
  if (stage === "provisional") return `${base.toLowerCase()} (prov.)`;
  return base;
}

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
  const stage = outlook.confidence_stage;
  // Border + framing follow the stage. Forming uses muted styling so
  // a fragile read isn't visually equivalent to a 25-anchor earned
  // call. Earned uses the peak-tier tone (the original behavior).
  const peakTone = TIER_TONE[peak.tier];
  const stageBorder =
    stage === "forming" || stage === "trending"
      ? "border-border-strong"
      : peakTone.border;

  // Header text changes with stage. Forming = "Outlook forming";
  // earned = "Peak 2030 · Contender (82/100)". The conclusive-label
  // failure mode (Rebuild 55/100 at pick 3) was the header projecting
  // false precision; the math is right but the framing earned no tier.
  const header =
    stage === "forming"
      ? `${STAGE_HEADER.forming} · ${outlook.anchor_count} anchor${outlook.anchor_count === 1 ? "" : "s"}`
      : stage === "trending"
        ? `${STAGE_HEADER.trending} · trending ${tierLabel(peak.tier).toLowerCase()} by ${peak.season}`
        : `Peak ${peak.season} · ${tierLabelFuzzy(peak.tier, peak.score)} (${peak.score}/100)`;

  return (
    <section
      className={`mt-8 rounded-lg border-2 ${stageBorder} bg-surface px-5 py-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Contender outlook · {outlook.years.length} years · {STAGE_HEADER[stage].toLowerCase()}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {header}
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {stage === "earned"
            ? "Rebuild <60 · Bubble 60-74 · Contender 75+"
            : `Earns conclusive tier at 25+ anchors · ${outlook.anchor_count} now`}
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
                className={`text-right font-mono text-[10px] uppercase tracking-[0.14em] ${
                  stage === "forming" || stage === "trending"
                    ? "text-muted-2"
                    : tone.chip
                }`}
                title={
                  stage === "earned"
                    ? tierLabelFuzzy(y.tier, y.score)
                    : `${STAGE_HEADER[stage]}: tier label not yet earned`
                }
              >
                {softTierLabel(y.tier, stage)}
                {stage === "earned" && y.tier === "contender" ? " ✓" : ""}
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
