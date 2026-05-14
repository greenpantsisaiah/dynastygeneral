/**
 * Sample doctrine readout. Renders three preset doctrines side-by-side
 * with their dial fingerprints + the equation each implies. Closes the
 * loop with the Rankings Lab: the doctrine readout you see when you
 * tune dials is the same one that flows into Coach.
 *
 * Per founder feedback 2026-05-14: "Doctrine readout sample is super
 * cool." Build it.
 */

import { PRESETS } from "@/lib/lab/presets";
import { deriveDoctrine, formatDoctrineLine } from "@/lib/lab/doctrine";
import {
  DIAL_SPECS,
  defaultProfile,
  type DialId,
  type DialValue,
} from "@/lib/lab/dial-types";

// Three presets chosen to span the doctrine spectrum.
const PRESET_IDS_TO_SHOW = [
  "aggressive_rebuilder",
  "patient_contender",
  "win_now_maxer",
] as const;

function dialsFromPreset(presetId: string): Record<DialId, DialValue> {
  const preset = PRESETS.find((p) => p.id === presetId);
  const base = defaultProfile().dials;
  if (!preset) return base;
  const next = { ...base };
  for (const [k, v] of Object.entries(preset.values)) {
    next[k as DialId] = v as DialValue;
  }
  return next;
}

function asNum(v: DialValue | undefined): number {
  return typeof v === "number" ? v : 0;
}

export function DoctrineReadoutSample() {
  const cards = PRESET_IDS_TO_SHOW.map((id) => {
    const preset = PRESETS.find((p) => p.id === id);
    const dials = dialsFromPreset(id);
    const doctrine = deriveDoctrine(dials);
    return { preset, dials, doctrine };
  });

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Doctrine readout · sample
          </div>
          <p className="mt-1 text-sm text-muted">
            Three preset doctrines from the Rankings Lab. The dial
            fingerprint + the synthesized doctrine line + the algorithm
            it implies, side by side. Tune your own at /rankings; the
            readout updates as you move dials.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {cards.map(({ preset, dials, doctrine }) => {
          if (!preset) return null;
          const youthW = asNum(dials.youth_weight) / 100;
          const bellcowW = asNum(dials.bellcow_pref) / 100;
          const continuityW = asNum(dials.continuity_weight) / 100;
          return (
            <article
              key={preset.id}
              className="rounded-md border border-border-soft bg-surface-2 px-4 py-4"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {preset.name}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-muted">
                {preset.blurb}
              </p>

              <div className="mt-3 text-base font-semibold text-foreground">
                {formatDoctrineLine(doctrine)}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                {doctrine.calibrated_count} of {DIAL_SPECS.length} dials moved
              </div>

              <div className="mt-4">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                  Dial fingerprint
                </div>
                <div className="mt-2 space-y-1">
                  {DIAL_SPECS.map((spec) => {
                    const v = asNum(dials[spec.id]);
                    const pct = (v + 100) / 2;
                    return (
                      <div
                        key={spec.id}
                        className="flex items-center gap-2 text-[11px]"
                      >
                        <div className="min-w-[78px] font-mono text-[9px] uppercase tracking-[0.12em] text-muted-2">
                          {spec.name}
                        </div>
                        <div className="relative flex-1 overflow-hidden rounded-sm bg-surface">
                          <div className="absolute left-1/2 top-0 h-3 w-px bg-border-soft" />
                          <div
                            className={`h-3 ${v >= 0 ? "ml-[50%] bg-accent" : "bg-[color:#a78bfa]"}`}
                            style={{
                              width: `${Math.abs(v) / 2}%`,
                              marginLeft:
                                v >= 0 ? "50%" : `${50 - Math.abs(v) / 2}%`,
                            }}
                          />
                        </div>
                        <div
                          className={`min-w-[28px] text-right font-mono text-[10px] ${
                            v === 0
                              ? "text-muted-2"
                              : v > 0
                                ? "text-accent"
                                : "text-[color:#a78bfa]"
                          }`}
                        >
                          {v === 0 ? "0" : v > 0 ? `+${v}` : `${v}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-sm border border-border-soft bg-surface px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground">
                <span className="italic">DG(p)</span>
                <span className="text-muted-2">=</span>
                <span className="italic">market</span>
                <span className="mx-1 text-muted-2">+</span>
                <span className="text-muted-2">60</span>
                <span className="mx-1 text-muted-2">·</span>
                <span className="text-muted-2">(</span>
                <span className="text-foreground">{youthW.toFixed(2)}</span>
                <span className="mx-0.5 text-muted-2">·Y</span>
                <span className="mx-1 text-muted-2">+</span>
                <span className="text-foreground">{bellcowW.toFixed(2)}</span>
                <span className="mx-0.5 text-muted-2">·B</span>
                <span className="mx-1 text-muted-2">+</span>
                <span className="text-foreground">{continuityW.toFixed(2)}</span>
                <span className="mx-0.5 text-muted-2">·C</span>
                <span className="text-muted-2">)</span>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Same engine, three different doctrines. The dial fingerprint
        produces a doctrine line ("Aggressive Rebuilder · Soft Market
        · Confident"), which produces a coefficient vector, which
        produces a ranking. Coach sees the doctrine line on every
        request and references it explicitly when the user has tuned
        dials off default.
      </p>
    </div>
  );
}
