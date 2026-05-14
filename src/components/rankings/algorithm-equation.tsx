"use client";

/**
 * Algorithm / equation display. The screenshot moment for a tuned
 * model. Renders the user's current dial state as a mathematical
 * equation in monospace typography, with the dial weights highlighted
 * inline, plus a compact "model ID" suitable for pasting into the
 * group chat.
 *
 * Voice A: this looks like math, names what the math does, and ships
 * with a "Share" affordance so the model becomes a shareable artifact.
 *
 * Per founder direction 2026-05-14: "I want that part of it to feel
 * like I created an actual algorithm/equation that's uniquely mine."
 */

import { useMemo, useState } from "react";

export type AlgorithmDials = {
  youth: number; // 0..1
  bellcow: number; // 0..1
  continuity: number; // 0..1
};

const DIAL_EMPHASIS_RANGE = 60;

function pct(v: number): string {
  return `${Math.round(v * 100)}`;
}

function modelId(d: AlgorithmDials): string {
  const y = Math.round(d.youth * 100);
  const b = Math.round(d.bellcow * 100);
  const c = Math.round(d.continuity * 100);
  return `Y${y}·B${b}·C${c}`;
}

function termStrength(weight: number): "off" | "light" | "active" | "heavy" {
  const distance = Math.abs(weight - 0.5);
  if (distance < 0.04) return "off";
  if (distance < 0.15) return "light";
  if (distance < 0.35) return "active";
  return "heavy";
}

const STRENGTH_TONE: Record<
  ReturnType<typeof termStrength>,
  string
> = {
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
        ? `${window.location.origin}/rankings?y=${Math.round(
            dials.youth * 100,
          )}&b=${Math.round(dials.bellcow * 100)}&c=${Math.round(
            dials.continuity * 100,
          )}`
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

  const youthStrength = termStrength(dials.youth);
  const bellcowStrength = termStrength(dials.bellcow);
  const continuityStrength = continuityDisabled
    ? "off"
    : termStrength(dials.continuity);

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Your model
          </div>
          <p className="mt-1 text-xs text-muted">
            The exact algorithm your current dial state implements. As
            you slide a dial, the coefficient updates here.
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

      <div className="mt-4 overflow-x-auto">
        <div className="font-mono text-sm leading-relaxed text-foreground sm:text-base">
          <div>
            <span className="text-muted-2">DG(player)</span>{" "}
            <span className="text-muted-2">=</span>{" "}
            <span className="text-foreground">market</span>{" "}
            <span className="text-muted-2">+</span>{" "}
            <span className="text-muted-2">{DIAL_EMPHASIS_RANGE}</span>{" "}
            <span className="text-muted-2">·</span>{" "}
            <span className="text-muted-2">(</span>
          </div>
          <div className="pl-6">
            <Coefficient
              value={dials.youth}
              tone={STRENGTH_TONE[youthStrength]}
            />{" "}
            <span className="text-muted-2">·</span>{" "}
            <span className={STRENGTH_TONE[youthStrength]}>
              youth(player)
            </span>
          </div>
          <div className="pl-6">
            <span className="text-muted-2">+</span>{" "}
            <Coefficient
              value={dials.bellcow}
              tone={STRENGTH_TONE[bellcowStrength]}
            />{" "}
            <span className="text-muted-2">·</span>{" "}
            <span className={STRENGTH_TONE[bellcowStrength]}>
              bellcow(player)
            </span>
          </div>
          <div className="pl-6">
            <span className="text-muted-2">+</span>{" "}
            <Coefficient
              value={continuityDisabled ? 0 : dials.continuity}
              tone={STRENGTH_TONE[continuityStrength]}
            />{" "}
            <span className="text-muted-2">·</span>{" "}
            <span className={STRENGTH_TONE[continuityStrength]}>
              continuity(player)
            </span>
            {continuityDisabled && (
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
                pending wiring
              </span>
            )}
          </div>
          <div>
            <span className="text-muted-2">)</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-2">
        <span>
          <span className="font-mono text-foreground">market</span> = FantasyCalc
          consensus value (0 to 100)
        </span>
        <span>
          <span className="font-mono text-foreground">youth</span>,{" "}
          <span className="font-mono text-foreground">bellcow</span>,{" "}
          <span className="font-mono text-foreground">continuity</span> = signed
          component scores (-1 to +1)
        </span>
      </div>

      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Y{pct(dials.youth)} · B{pct(dials.bellcow)} · C
        {continuityDisabled ? "00" : pct(dials.continuity)}
      </div>
    </section>
  );
}

function Coefficient({
  value,
  tone,
}: {
  value: number;
  tone: string;
}) {
  // -1 to +1 signed coefficient. We display the (value - 0.5) * 2 form
  // so 0.5 reads as 0 (neutral), 1.0 reads as +1.0 (max), 0 reads as
  // -1.0 (max inverse).
  const signed = (value - 0.5) * 2;
  const rounded = signed === 0 ? "0.00" : signed.toFixed(2);
  const sign = signed > 0 ? "+" : signed < 0 ? "" : " ";
  return (
    <span className={`font-mono ${tone}`}>
      {sign}
      {rounded}
    </span>
  );
}
