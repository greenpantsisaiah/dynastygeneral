"use client";

/**
 * Algorithm display. Two states:
 *
 *   COMPRESSED (default): the equation, centered, with all 7 ranking-
 *   affecting dials substituted live. At neutral all coefficients
 *   read 0.00; as dials move the active terms light up.
 *
 *   EXPANDED: function cards explain each component.
 *
 * Per founder direction 2026-05-14: the equation should reflect every
 * dial that influences the visible table. Trade aggression is the
 * only dial that does not appear here (it's Coach behavior).
 */

import { useMemo, useState } from "react";

export type AlgorithmDials = {
  /** Signed -100..+100 with 0 default. */
  youth: number;
  bellcow: number;
  continuity: number;
  horizon: number;
  rookie: number;
  risk: number;
  consensus: number;
};

type TermSpec = {
  key: keyof AlgorithmDials;
  /** Single-letter symbol in the math equation. */
  symbol: string;
  /** Lowercase italic name in the math, e.g., `youth`. */
  mathName: string;
  /** Short label for the model id, e.g., `Y` or `Rk`. */
  idTag: string;
  /** Disabled-by-calibration tag (Continuity dial today). */
  pendingFlag?: "continuity";
};

const TERMS: TermSpec[] = [
  { key: "youth", symbol: "Y", mathName: "youth", idTag: "Y" },
  { key: "bellcow", symbol: "B", mathName: "bellcow", idTag: "B" },
  {
    key: "continuity",
    symbol: "C",
    mathName: "continuity",
    idTag: "C",
    pendingFlag: "continuity",
  },
  { key: "horizon", symbol: "H", mathName: "horizon", idTag: "H" },
  { key: "rookie", symbol: "R", mathName: "rookie", idTag: "Rk" },
  { key: "risk", symbol: "S", mathName: "risk", idTag: "Rs" },
  { key: "consensus", symbol: "M", mathName: "consensus", idTag: "Cl" },
];

function modelId(d: AlgorithmDials): string {
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  // Use 3-tag compact id for the share-bar; longer when the user has
  // moved past the foundational three.
  const movedTags = TERMS.filter((t) => Math.abs(d[t.key]) >= 5);
  if (movedTags.length === 0) {
    return TERMS.slice(0, 3)
      .map((t) => `${t.idTag}${fmt(d[t.key])}`)
      .join(" · ");
  }
  return movedTags.map((t) => `${t.idTag}${fmt(d[t.key])}`).join(" · ");
}

function strength(weight: number): "off" | "light" | "active" | "heavy" {
  const m = Math.abs(weight);
  if (m < 5) return "off";
  if (m < 25) return "light";
  if (m < 60) return "active";
  return "heavy";
}

const TONE: Record<ReturnType<typeof strength>, string> = {
  off: "text-muted-2",
  light: "text-foreground",
  active: "text-accent",
  heavy: "text-[color:#a78bfa]",
};

export function AlgorithmEquation({
  dials,
  continuityDisabled,
}: {
  dials: AlgorithmDials;
  /**
   * Render the continuity term grayed and tagged "pending" so the
   * equation does not lie about a coefficient that has no effect on
   * the live model yet.
   */
  continuityDisabled?: boolean;
}) {
  const id = useMemo(() => modelId(dials), [dials]);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/rankings?y=${dials.youth}&b=${dials.bellcow}&c=${dials.continuity}&h=${dials.horizon}&rk=${dials.rookie}&rs=${dials.risk}&cl=${dials.consensus}`
        : "";
    try {
      if (navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // ignore; clipboard may be unavailable
    }
  }

  const termRenderable = TERMS.map((t) => {
    const raw = dials[t.key];
    const pending: boolean = Boolean(
      continuityDisabled && t.pendingFlag === "continuity",
    );
    const weight = pending ? 0 : raw / 100;
    const tone = pending ? TONE.off : TONE[strength(raw)];
    return {
      ...t,
      weight: weight.toFixed(2),
      tone,
      pending,
    };
  });

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Your algorithm
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-md border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground"
            title="Model id · compact dial fingerprint"
          >
            {id}
          </span>
          <button
            type="button"
            onClick={share}
            className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent transition hover:bg-accent/20"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 transition hover:border-accent/60 hover:text-accent"
          >
            {expanded ? "Collapse" : "Expand · teach"}
          </button>
        </div>
      </div>

      <CompactEquation terms={termRenderable} />

      {expanded && <ExpandedFunctions />}

      <div className="mt-3 border-t border-border-soft pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Seven of eight dials appear in the equation above. The Trade
        aggression dial does not; it shapes Coach proactivity (when to
        propose deals) rather than player scoring on this table.
      </div>
    </section>
  );
}

function CompactEquation({
  terms,
}: {
  terms: Array<{
    key: keyof AlgorithmDials;
    symbol: string;
    mathName: string;
    weight: string;
    tone: string;
    pending: boolean;
  }>;
}) {
  return (
    <div className="mt-3 py-4">
      <div className="overflow-x-auto">
        <div className="font-mono text-sm leading-relaxed text-foreground sm:text-base">
          <div className="text-center">
            <span className="italic">DG</span>
            <span className="text-muted-2">(p) =</span>
            <span className="mx-2 italic">market</span>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">+</span>
            <span className="text-muted-2">60</span>
            <span className="mx-1 text-muted-2">·</span>
            <span className="text-muted-2">(</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
            {terms.map((t, i) => (
              <span
                key={t.key}
                className="flex items-baseline gap-1"
                title={
                  t.pending
                    ? `${t.mathName} term pending team_signals calibration`
                    : `${t.mathName} term: dial weight × signed component`
                }
              >
                {i > 0 && <span className="text-muted-2">+</span>}
                <span className={`font-semibold ${t.tone}`}>{t.weight}</span>
                <span className="text-muted-2">·</span>
                <span className={`italic ${t.tone}`}>{t.mathName}</span>
              </span>
            ))}
            <span className="text-muted-2">)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedFunctions() {
  return (
    <div className="mt-2">
      <div className="grid gap-3 lg:grid-cols-2">
        <FunctionCard
          title="Youth"
          formula="f_Y(p) = sign(μ_pos − age) · ω_pos(age)"
          body={[
            "Position-aware age curve with peak centers RB 24.5, WR 26.5, TE 28, QB 28.",
            "Calibrated from 2022 to 2025 NFL starter cohort. Refit when validation surfaces drift.",
          ]}
        />
        <FunctionCard
          title="Bellcow"
          formula="f_B(p) = piecewise(rank_RB)"
          body={[
            "RB only. +1.0 at top-6, +0.5 at 7-12, +0.1 at 13-18, −0.3 at 19-24, −1.0 past.",
            "v1 uses positional rank as a workhorse proxy; v2 plugs in rb_role_tier + pass-down share.",
          ]}
        />
        <FunctionCard
          title="Continuity"
          formula="f_C(p) = (oc_tenure(team) − 1.5) / 1.5"
          body={[
            "OC tenure 3+ years scores positive; first-year OC negative; second-year neutral.",
            "Neutral on the live ranking today. team_signals table is mid-calibration; the dial is rendered disabled.",
          ]}
          warning
        />
        <FunctionCard
          title="Horizon"
          formula="f_H(p) = clamp((28 − age) / 7, −1, +1); rookies = +1"
          body={[
            "Position-agnostic runway signal. Positive = long career window; negative = past peak.",
            "Lets the Horizon dial pull the table toward win-now or future without touching the age-curve peak placement.",
          ]}
        />
        <FunctionCard
          title="Rookie"
          formula="f_R(p) = is_rookie ? +1 : −0.4"
          body={[
            "Simple flag-based component. Rookie tilt dial rewards or punishes rookie status across the entire pool.",
            "Negative offset on non-rookies keeps the dial bidirectional rather than rookie-only.",
          ]}
        />
        <FunctionCard
          title="Risk"
          formula="f_S(p) = variance proxy from rookie status + position rank"
          body={[
            "v1: rookies = +1.0 (high variance); consensus top-12 + top-30 overall = −1.0; outside top-30 = +0.6.",
            "v2 will incorporate KTC-vs-ADP divergence as a sharper variance signal.",
          ]}
        />
        <FunctionCard
          title="Consensus"
          formula="f_M(p) = market-alignment proxy from position + market rank"
          body={[
            "v1: top-6 at position + top-24 overall = +1.0; rookies + fringe ranks = −0.5.",
            "Positive Consensus lean dial pulls market-aligned players up; negative dial favors off-consensus picks.",
          ]}
        />
      </div>
    </div>
  );
}

function FunctionCard({
  title,
  formula,
  body,
  warning = false,
}: {
  title: string;
  formula: string;
  body: string[];
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        warning
          ? "border-warning/40 bg-warning/5"
          : "border-border-soft bg-surface-2"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        {title}
      </div>
      <div className="mt-1 font-mono text-xs text-foreground">{formula}</div>
      <ul className="mt-2 space-y-1 text-[12px] leading-snug text-muted">
        {body.map((line, i) => (
          <li key={i}>· {line}</li>
        ))}
      </ul>
    </div>
  );
}
