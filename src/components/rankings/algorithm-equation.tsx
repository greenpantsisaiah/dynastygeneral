"use client";

/**
 * Algorithm display. The "crazy genius math at a whiteboard" surface.
 * Renders the model as a mathematical equation with the user's live
 * dial coefficients substituted in, plus a `where:` block defining
 * each function in the larger engine.
 *
 * Greek letters, Σ notation, piecewise cases, and a downstream-
 * consumers block let the visitor see the depth of the model in one
 * scroll. The compact model ID + Share button sit on the right so the
 * whole block screenshots well.
 *
 * Per founder direction 2026-05-14: "I was expecting the algorithm to
 * show a lot more of our model, not just the dials. It's okay if it
 * looks complicated and like crazy genius math at a whiteboard."
 *
 * Dial values are signed [-100..+100] with 0 default. The displayed
 * coefficient w_i = dial / 100 lives in [-1..+1].
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

  const wY = dials.youth / 100;
  const wB = dials.bellcow / 100;
  const wC = continuityDisabled ? 0 : dials.continuity / 100;

  const tY = TONE[strength(dials.youth)];
  const tB = TONE[strength(dials.bellcow)];
  const tC = continuityDisabled ? TONE.off : TONE[strength(dials.continuity)];

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Your algorithm
          </div>
          <p className="mt-1 text-xs text-muted">
            The math your dials implement. Live coefficients substituted
            in. Below the equation, the function definitions and the
            downstream engine consumers that use the output.
          </p>
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
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="font-mono text-[13px] leading-[1.9] text-foreground sm:text-[14px]">
          {/* Top-level model equation */}
          <div className="text-base">
            <span className="italic text-foreground">DG</span>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="italic">market</span>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">+</span>
            <span className="text-muted-2">60</span>
            <span className="mx-1 text-muted-2">·</span>
            <span className="text-lg text-muted-2">Σ</span>
            <span className="ml-1 text-muted-2">[</span>
            <span className="italic text-muted-2"> w</span>
            <sub className="text-[10px] text-muted-2">i</sub>
            <span className="mx-1 text-muted-2">·</span>
            <span className="italic text-muted-2">f</span>
            <sub className="text-[10px] text-muted-2">i</sub>
            <span className="text-muted-2">(p) ]</span>
            <span className="ml-3 text-[10px] text-muted-2">
              i ∈ {"{"} Y, B, C {"}"}
            </span>
          </div>

          {/* Live-substituted weights */}
          <div className="mt-4 text-[12px] text-muted-2">where:</div>

          <div className="mt-2 pl-4">
            <span className="italic">market</span>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="italic">FC</span>
            <span className="text-muted-2">(p) · 100 / </span>
            <span className="text-muted-2">max</span>
            <sub className="text-[9px] text-muted-2">q∈Ω</sub>
            <span className="italic text-muted-2"> FC</span>
            <span className="text-muted-2">(q)</span>
            <span className="ml-4 text-[10px] text-muted-2">
              ← FantasyCalc consensus (Ω = top 100 dynasty pool)
            </span>
          </div>

          <div className="mt-3 pl-4">
            <span className="italic">w</span>
            <sub className="text-[10px]">Y</sub>
            <span className="mx-2 text-muted-2">=</span>
            <span className={`font-semibold ${tY}`}>{wY.toFixed(2)}</span>
            <span className="mx-3 text-muted-2">|</span>
            <span className="italic">w</span>
            <sub className="text-[10px]">B</sub>
            <span className="mx-2 text-muted-2">=</span>
            <span className={`font-semibold ${tB}`}>{wB.toFixed(2)}</span>
            <span className="mx-3 text-muted-2">|</span>
            <span className="italic">w</span>
            <sub className="text-[10px]">C</sub>
            <span className="mx-2 text-muted-2">=</span>
            <span className={`font-semibold ${tC}`}>{wC.toFixed(2)}</span>
            {continuityDisabled && (
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
                pending
              </span>
            )}
            <span className="ml-4 text-[10px] text-muted-2">
              ← your dials, normalized to [-1, +1]
            </span>
          </div>

          {/* Youth function */}
          <div className="mt-4 pl-4">
            <span className="italic">f</span>
            <sub className="text-[10px]">Y</sub>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="text-muted-2">sign</span>
            <span className="text-muted-2">(μ</span>
            <sub className="text-[10px] text-muted-2">pos</sub>
            <span className="text-muted-2"> − age(p))</span>
            <span className="mx-1 text-muted-2">·</span>
            <span className="italic text-muted-2">ω</span>
            <sub className="text-[10px] text-muted-2">pos</sub>
            <span className="text-muted-2">(age(p))</span>
          </div>
          <div className="pl-10 text-[11px] text-muted-2">
            with peak centers μ
            <sub>RB</sub>=24.5, μ<sub>WR</sub>=26.5, μ<sub>TE</sub>=28, μ
            <sub>QB</sub>=28
          </div>
          <div className="pl-10 text-[11px] text-muted-2">
            and ω<sub>pos</sub> = piecewise band weight from age-curve
            calibration (2022 to 2025 starter cohort)
          </div>

          {/* Bellcow function (piecewise) */}
          <div className="mt-4 pl-4">
            <span className="italic">f</span>
            <sub className="text-[10px]">B</sub>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="text-muted-2">
              {"{ "}+1.0 if pos=RB ∧ rank≤6
            </span>
          </div>
          <div className="pl-10 text-[11px] text-muted-2">
            +0.5 if pos=RB ∧ rank≤12 · +0.1 if rank≤18 · −0.3 if rank≤24
            · −1.0 if rank&gt;24 · 0 otherwise
          </div>
          <div className="pl-10 text-[11px] text-muted-2">
            v1 uses positional rank as workhorse proxy. v2 plugs in{" "}
            <span className="font-mono text-foreground">rb_role_tier</span>{" "}
            +{" "}
            <span className="font-mono text-foreground">
              rb_passdown_share
            </span>
          </div>

          {/* Continuity function */}
          <div className="mt-4 pl-4">
            <span className="italic">f</span>
            <sub className="text-[10px]">C</sub>
            <span className="text-muted-2">(p)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="text-muted-2">
              (oc_tenure(team(p)) − 1.5) / 1.5
            </span>
            {continuityDisabled && (
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
                pending team_signals calibration
              </span>
            )}
          </div>

          {/* Downstream engine consumers */}
          <div className="mt-5 border-t border-border-soft pt-4 text-[12px] text-muted-2">
            downstream (engine consumers):
          </div>
          <div className="mt-2 pl-4 text-[12px]">
            <span className="italic">lane</span>
            <span className="text-muted-2">(roster)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="text-muted-2">argmax</span>
            <sub className="text-[9px] text-muted-2">ℓ</sub>
            <span className="ml-1 text-lg text-muted-2">Σ</span>
            <sub className="text-[9px] text-muted-2">q∈R</sub>
            <span className="ml-1 text-muted-2">contribution</span>
            <span className="text-muted-2">(q, ℓ)</span>
            <span className="ml-3 text-[10px] text-muted-2">
              ← 82-roster cohort thresholds
            </span>
          </div>
          <div className="mt-1 pl-4 text-[12px]">
            <span className="italic">cascade</span>
            <span className="mx-2 text-muted-2">:</span>
            <span className="text-muted-2">
              KTC ≻ ADP<sub>format</sub> ≻ heuristic_dynasty
            </span>
          </div>
          <div className="mt-1 pl-4 text-[12px]">
            <span className="italic">scarcity</span>
            <span className="text-muted-2">(pos, league)</span>
            <span className="mx-2 text-muted-2">=</span>
            <span className="text-muted-2">
              starter_slots(pos) · format_multiplier(league)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
