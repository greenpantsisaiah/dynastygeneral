/**
 * Posture Banner. Surfaces the engine's read of where this roster
 * sits on the multi-year contender arc: contender, win-now, balanced,
 * rebuilder, teardown, or tank.
 *
 * Goal: the user lands on the hub and sees their roster's posture in
 * 1.5 seconds, with the lens (defend window / preserve capital / etc.)
 * naming the decision frame for everything that follows on the page.
 *
 * Per founder direction 2026-05-16: dynasty is multi-year; current
 * surfaces treat every roster as a "this season" decision. This
 * banner makes the multi-year posture explicit at the top of the hub.
 */

import type { RosterPosture } from "@/lib/strategy/posture/types";

const POSTURE_TONE: Record<
  RosterPosture["category"],
  { border: string; bg: string; label: string; labelTone: string }
> = {
  contender: {
    border: "border-success/60",
    bg: "bg-success/5",
    label: "CONTENDER",
    labelTone: "text-success",
  },
  win_now: {
    border: "border-success/40",
    bg: "bg-success/5",
    label: "WIN-NOW",
    labelTone: "text-success",
  },
  balanced: {
    border: "border-border-strong",
    bg: "bg-surface",
    label: "BALANCED",
    labelTone: "text-foreground",
  },
  rebuilder: {
    border: "border-accent/50",
    bg: "bg-accent/5",
    label: "REBUILDER",
    labelTone: "text-accent",
  },
  teardown: {
    border: "border-2 border-[color:#a78bfa]/70",
    bg: "bg-[color:#a78bfa]/5",
    label: "TEARDOWN",
    labelTone: "text-[color:#a78bfa]",
  },
  tank: {
    border: "border-warning/50",
    bg: "bg-warning/5",
    label: "TANK",
    labelTone: "text-warning",
  },
};

const LENS_COPY: Record<
  RosterPosture["recommended_lens"],
  { label: string; instruction: string }
> = {
  defend_window: {
    label: "Defend window",
    instruction:
      "Hold value, target proven win-now adds, avoid trading future capital for speculation. The window is open now.",
  },
  complete_contender: {
    label: "Complete the contender",
    instruction:
      "Identify the one or two pieces between you and contention. Convert mid-tier future picks into proven production.",
  },
  balance_both: {
    label: "Balance both lenses",
    instruction:
      "Roster reads mid-pack on both axes. Decide whether to lean toward contention now or hold for future windows; the engine surfaces both paths.",
  },
  patient_build: {
    label: "Patient build",
    instruction:
      "Accumulate young assets and picks. Trade aging starters for capital; pass on win-now veteran adds unless they're cherries.",
  },
  preserve_capital: {
    label: "Preserve capital",
    instruction:
      "Sell-off has banked future picks. Don't trade those picks for win-now production unless the deal beats the market by 20%+. Your war is in the future.",
  },
  evaluate_teardown: {
    label: "Evaluate teardown",
    instruction:
      "Bottom of the league with light future capital. Decide whether to commit to a deliberate teardown (sell remaining starters for picks) or hold and stack rookie value.",
  },
};

export function PostureBanner({ posture }: { posture: RosterPosture }) {
  const tone = POSTURE_TONE[posture.category];
  const lens = LENS_COPY[posture.recommended_lens];
  const confidencePct = Math.round(posture.confidence * 100);
  return (
    <section
      className={`mt-4 rounded-lg ${tone.border} ${tone.bg} px-5 py-4`}
      aria-label="Roster posture"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Posture
          </span>
          <span
            className={`font-mono text-xs font-semibold uppercase tracking-[0.18em] ${tone.labelTone}`}
          >
            {tone.label}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {confidencePct}% confidence
          </span>
        </div>
        {posture.future_capital.league_rank != null && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2"
            title="Your league rank for total future-pick value, summed across the 5-year horizon and discounted by year + class strength."
          >
            future capital ·{" "}
            <span className="text-foreground">
              {posture.future_capital.league_rank} of{" "}
              {posture.future_capital.rank_total}
            </span>
            {posture.future_capital.total_first_rounders > 0 && (
              <>
                {" · "}
                <span className="text-foreground">
                  {posture.future_capital.total_first_rounders}{" "}
                </span>
                future R1
                {posture.future_capital.total_first_rounders === 1 ? "" : "s"}
              </>
            )}
          </span>
        )}
      </div>

      <p className="mt-3 text-lg font-semibold leading-tight text-foreground">
        {posture.headline}
      </p>

      <p className="mt-1 text-xs leading-snug text-muted">
        {posture.contender_window.why}
      </p>

      {posture.signals.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[11px] leading-snug text-muted-2">
          {posture.signals.map((s, i) => (
            <li key={i}>· {s}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-border-soft pt-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          Recommended lens · {lens.label}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-foreground">
          {lens.instruction}
        </p>
      </div>
    </section>
  );
}
