"use client";

/**
 * Algorithm display. Two states:
 *
 *   COMPRESSED (default): just the equation, centered, big, with live
 *   weight substitution. Model ID + Share + Expand controls on the
 *   right. Designed to sit between the dial bar and the rankings
 *   table as a screenshot-worthy centerpiece.
 *
 *   EXPANDED: same equation with Schrödinger-style annotated callouts
 *   above and below pointing at each term, plus the deeper function
 *   definitions (Youth gaussian, Bellcow piecewise, Continuity ratio)
 *   and the downstream engine consumers. Expanded state teaches.
 *
 * Per founder direction 2026-05-14:
 *   "Compressed UI on the screen where I can just see the algorithm
 *   itself when I change the dials... then expand to get the
 *   definitions/math/teaching. A little bit of diagramming what the
 *   things on the algorithm mean on expansion."
 *
 * Dial values are signed [-100..+100] with 0 default. The coefficient
 * w_i = dial / 100 lives in [-1..+1] and substitutes live.
 */

import { useMemo, useState } from "react";

export type AlgorithmDials = {
  /** Signed -100..+100 with 0 default. */
  youth: number;
  bellcow: number;
  continuity: number;
};

function modelId(d: AlgorithmDials): string {
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `Y${fmt(d.youth)} · B${fmt(d.bellcow)} · C${fmt(d.continuity)}`;
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
        ? `${window.location.origin}/rankings?y=${dials.youth}&b=${dials.bellcow}&c=${dials.continuity}`
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

  const wY = (dials.youth / 100).toFixed(2);
  const wB = (dials.bellcow / 100).toFixed(2);
  const wC = continuityDisabled ? "0.00" : (dials.continuity / 100).toFixed(2);

  const tY = TONE[strength(dials.youth)];
  const tB = TONE[strength(dials.bellcow)];
  const tC = continuityDisabled ? TONE.off : TONE[strength(dials.continuity)];

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Your algorithm
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border-soft bg-surface-2 px-2 py-1 font-mono text-xs text-foreground">
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

      {expanded ? (
        <AnnotatedEquation
          wY={wY}
          wB={wB}
          wC={wC}
          tY={tY}
          tB={tB}
          tC={tC}
          continuityDisabled={continuityDisabled ?? false}
        />
      ) : (
        <CompactEquation
          wY={wY}
          wB={wB}
          wC={wC}
          tY={tY}
          tB={tB}
          tC={tC}
          continuityDisabled={continuityDisabled ?? false}
        />
      )}
    </section>
  );
}

function CompactEquation({
  wY,
  wB,
  wC,
  tY,
  tB,
  tC,
  continuityDisabled,
}: {
  wY: string;
  wB: string;
  wC: string;
  tY: string;
  tB: string;
  tC: string;
  continuityDisabled: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col items-center justify-center py-6">
      <div className="font-mono text-base text-foreground sm:text-xl">
        <span className="italic">DG</span>
        <span className="text-muted-2">(p) =</span>
        <span className="mx-2 italic">market</span>
        <span className="text-muted-2">(p)</span>
        <span className="mx-2 text-muted-2">+</span>
        <span className="text-muted-2">60</span>
        <span className="mx-1 text-muted-2">·</span>
        <span className="text-muted-2">(</span>
        <span className={`font-semibold ${tY}`}>{wY}</span>
        <span className="mx-1 text-muted-2">·</span>
        <span className={`italic ${tY}`}>youth</span>
        <span className="mx-1.5 text-muted-2">+</span>
        <span className={`font-semibold ${tB}`}>{wB}</span>
        <span className="mx-1 text-muted-2">·</span>
        <span className={`italic ${tB}`}>bellcow</span>
        <span className="mx-1.5 text-muted-2">+</span>
        <span className={`font-semibold ${tC}`}>{wC}</span>
        <span className="mx-1 text-muted-2">·</span>
        <span className={`italic ${tC}`}>continuity</span>
        <span className="text-muted-2">)</span>
      </div>
      {continuityDisabled && (
        <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
          Continuity term pending team_signals calibration
        </div>
      )}
    </div>
  );
}

/**
 * Term in the annotated equation. Renders the math + an optional
 * label above and/or below with a connector line. The label aligns to
 * the term horizontally via the flex layout; the connector is a CSS
 * vertical rule.
 */
function Term({
  math,
  topLabel,
  bottomLabel,
  topAccent,
  bottomAccent,
  toneClass = "text-foreground",
}: {
  math: React.ReactNode;
  topLabel?: string;
  bottomLabel?: string;
  topAccent?: boolean;
  bottomAccent?: boolean;
  toneClass?: string;
}) {
  const accentTone = "text-accent";
  return (
    <span className="inline-flex flex-col items-center align-middle">
      <span
        className="flex h-12 w-full flex-col items-center justify-end"
        aria-hidden={!topLabel}
      >
        {topLabel ? (
          <>
            <span
              className={`max-w-[140px] text-center text-[10px] leading-tight ${
                topAccent ? accentTone : "text-muted-2"
              }`}
            >
              {topLabel}
            </span>
            <span
              className={`mt-1 h-3 w-px ${
                topAccent ? "bg-accent/60" : "bg-muted-2/40"
              }`}
              aria-hidden="true"
            />
          </>
        ) : null}
      </span>
      <span className={`whitespace-nowrap font-mono ${toneClass}`}>{math}</span>
      <span
        className="flex h-12 w-full flex-col items-center justify-start"
        aria-hidden={!bottomLabel}
      >
        {bottomLabel ? (
          <>
            <span
              className={`h-3 w-px ${
                bottomAccent ? "bg-accent/60" : "bg-muted-2/40"
              }`}
              aria-hidden="true"
            />
            <span
              className={`mt-1 max-w-[140px] text-center text-[10px] leading-tight ${
                bottomAccent ? accentTone : "text-muted-2"
              }`}
            >
              {bottomLabel}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}

function AnnotatedEquation({
  wY,
  wB,
  wC,
  tY,
  tB,
  tC,
  continuityDisabled,
}: {
  wY: string;
  wB: string;
  wC: string;
  tY: string;
  tB: string;
  tC: string;
  continuityDisabled: boolean;
}) {
  return (
    <div className="mt-2">
      <div className="overflow-x-auto py-4">
        <div className="mx-auto flex w-fit items-center justify-center font-mono text-base text-foreground sm:text-lg">
          <Term
            math={
              <>
                <span className="italic">DG</span>
                <span className="text-muted-2">(p)</span>
              </>
            }
            topLabel="Your model's score for one player"
            topAccent
          />
          <span className="px-2 text-muted-2">=</span>
          <Term
            math={
              <>
                <span className="italic">market</span>
                <span className="text-muted-2">(p)</span>
              </>
            }
            bottomLabel="FantasyCalc dynasty consensus, normalized to 0-100"
          />
          <span className="px-2 text-muted-2">+</span>
          <Term
            math={<span className="text-muted-2">60</span>}
            topLabel="Max swing in points one dial can cause"
          />
          <span className="px-1 text-muted-2">·</span>
          <Term
            math={<span className="text-muted-2">(</span>}
          />
          <Term
            math={<span className={`font-semibold ${tY}`}>{wY}</span>}
            bottomLabel="Your Youth dial / 100"
            bottomAccent
          />
          <span className="px-1 text-muted-2">·</span>
          <Term
            math={<span className={`italic ${tY}`}>youth</span>}
            topLabel="Age-curve component, signed [-1, +1]"
          />
          <span className="px-1.5 text-muted-2">+</span>
          <Term
            math={<span className={`font-semibold ${tB}`}>{wB}</span>}
            bottomLabel="Your Bellcow dial / 100"
            bottomAccent
          />
          <span className="px-1 text-muted-2">·</span>
          <Term
            math={<span className={`italic ${tB}`}>bellcow</span>}
            topLabel="RB workhorse proxy, signed [-1, +1]"
          />
          <span className="px-1.5 text-muted-2">+</span>
          <Term
            math={<span className={`font-semibold ${tC}`}>{wC}</span>}
            bottomLabel="Your Continuity dial / 100"
            bottomAccent
          />
          <span className="px-1 text-muted-2">·</span>
          <Term
            math={<span className={`italic ${tC}`}>continuity</span>}
            topLabel="OC tenure score, signed [-1, +1]"
          />
          <Term math={<span className="text-muted-2">)</span>} />
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <FunctionCard
          title="Youth"
          formula="f_Y(p) = sign(μ_pos − age) · ω_pos(age)"
          body={[
            "Peak centers μ are position-aware: RB 24.5, WR 26.5, TE 28, QB 28.",
            "ω_pos is the piecewise band weight from the age-curve calibration cohort (2022 to 2025 starter production).",
            "At dial 0 the term vanishes. At dial +100 a peak-age player adds 60 points; an aging player loses 60.",
          ]}
        />
        <FunctionCard
          title="Bellcow"
          formula="f_B(p) = piecewise(rank_RB)"
          body={[
            "+1.0 if rank_RB ≤ 6. +0.5 if ≤ 12. +0.1 if ≤ 18. −0.3 if ≤ 24. −1.0 otherwise. 0 for non-RBs.",
            "v1 uses positional rank as a workhorse proxy. v2 plugs in rb_role_tier + rb_passdown_share_prior_year to separate pass-catching RBs (Achane, Gibbs shape) from rotational backs.",
          ]}
        />
        <FunctionCard
          title="Continuity"
          formula="f_C(p) = (oc_tenure(team) − 1.5) / 1.5"
          body={[
            "OC tenure 3+ years scores positive. First-year OC scores negative. Second-year OC reads as neutral.",
            "Currently neutral on the live ranking. The 32-team team_signals table is mid-calibration; dial is wired but produces no effect until the table fills out.",
          ]}
          warning={continuityDisabled}
        />
      </div>

      <div className="mt-5 border-t border-border-soft pt-4 text-[12px] text-muted-2">
        downstream (engine consumers):
      </div>
      <div className="mt-2 grid gap-2 text-[12px] leading-relaxed text-muted">
        <div>
          <span className="italic">lane</span>
          <span className="text-muted-2">(roster) =</span>
          <span className="mx-1 text-muted-2">argmax</span>
          <sub className="text-[9px] text-muted-2">ℓ</sub>
          <span className="mx-1 text-lg text-muted-2">Σ</span>
          <sub className="text-[9px] text-muted-2">q∈R</sub>
          <span className="mx-1 italic">contribution</span>
          <span className="text-muted-2">(q, ℓ)</span>
          <span className="ml-3 text-[10px] text-muted-2">
            ← 82-roster cohort thresholds drive roster identity
          </span>
        </div>
        <div>
          <span className="italic">cascade</span>
          <span className="mx-2 text-muted-2">:</span>
          <span className="text-muted-2">
            KTC ≻ ADP<sub>format</sub> ≻ heuristic_dynasty
          </span>
        </div>
        <div>
          <span className="italic">scarcity</span>
          <span className="text-muted-2">(pos, league) =</span>
          <span className="mx-1 italic">starter_slots</span>
          <span className="text-muted-2">(pos)</span>
          <span className="mx-1 text-muted-2">·</span>
          <span className="italic">format_multiplier</span>
          <span className="text-muted-2">(league)</span>
        </div>
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
