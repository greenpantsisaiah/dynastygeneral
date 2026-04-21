"use client";

/**
 * Windows bar. full-width band rendering the two big quantified
 * meters: WIN-NOW and FUTURE-VALUE. When a window weighting is
 * declared, the target line overlays each meter and drift is flagged.
 *
 * Pre-computed scores come from the server (computeWindows). The
 * declared target is read client-side from localStorage.
 */

import { useCallback, useSyncExternalStore } from "react";
import { readDeclaredWindow } from "@/lib/strategy/declared-window";
import { getWindowWeighting } from "@/lib/strategy/windows/types";
import type { WindowsResult } from "@/lib/strategy/windows/compute";

function subscribeToStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function WindowsBar({
  leagueId,
  windows,
}: {
  leagueId: string;
  windows: WindowsResult;
}) {
  const declared = useSyncExternalStore(
    subscribeToStorage,
    useCallback(() => readDeclaredWindow(leagueId), [leagueId]),
    () => null,
  );

  const target = declared ? getWindowWeighting(declared) : null;
  const targetWinNowPct = target ? target.win_now_share : null;
  const targetFuturePct =
    target != null ? 100 - target.win_now_share : null;

  // For drift, we use the declared target ratio vs current ratio.
  const driftSeverity = target ? windows.drift_severity : null;

  return (
    <section className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Your windows
          </div>
          <div className="mt-0.5 text-sm text-muted">
            CAN-WIN-NOW vs FUTURE-EARNED-VALUE. both scored 0-100. Higher = more of that window. Components add to the total weighted by ×%.
          </div>
        </div>
        {target && (
          <div className="text-right">
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
              Target
            </div>
            <div className="text-sm font-semibold text-foreground">
              {target.label} · {target.win_now_share}/{100 - target.win_now_share}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Meter
          label="Can-win-now window"
          score={windows.win_now.score}
          tone="success"
          targetPct={targetWinNowPct}
          components={windows.win_now.components}
        />
        <Meter
          label="Future-earned-value window"
          score={windows.future_value.score}
          tone="accent"
          targetPct={targetFuturePct}
          components={windows.future_value.components}
        />
      </div>

      {driftSeverity && driftSeverity !== "none" && (
        <div
          className={`mt-4 rounded-md border px-3 py-2 text-xs ${
            driftSeverity === "high"
              ? "border-danger/60 bg-danger/5 text-danger"
              : "border-accent/60 bg-accent/5 text-accent"
          }`}
        >
          <span className="font-mono uppercase tracking-[0.14em]">
            {driftSeverity === "high" ? "Strong drift" : "Drift forming"}
          </span>{" "}
          · current ratio {windows.current_ratio}/{100 - windows.current_ratio}{" "}
          vs target {target?.win_now_share}/
          {100 - (target?.win_now_share ?? 50)}. Recheck your build before the next
          pick.
        </div>
      )}
    </section>
  );
}

function Meter({
  label,
  score,
  tone,
  targetPct,
  components,
}: {
  label: string;
  score: number;
  tone: "success" | "accent";
  targetPct: number | null;
  components: { label: string; value: number; weight: number; blurb?: string }[];
}) {
  const fillTone = tone === "success" ? "bg-success" : "bg-accent";
  const labelTone = tone === "success" ? "text-success" : "text-accent";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-2xl font-semibold ${labelTone}`}>
            {score}
          </span>
          <span className="font-mono text-xs text-muted-2">/ 100</span>
          {targetPct != null && (
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-foreground">
              · target {targetPct}
            </span>
          )}
        </div>
      </div>

      {/* Meter bar with scale ticks. Target lives inline in the
          header above (next to the score) to avoid the floating
          "Target NN" label colliding with section headers when the
          panel sits in tight vertical space. The vertical tick on
          the bar still marks position visually. */}
      <div className="relative mt-2 h-2 overflow-visible rounded-full bg-border-soft">
        <div
          className={`h-full rounded-full ${fillTone}`}
          style={{ width: `${score}%` }}
        />
        {targetPct != null && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-foreground"
            style={{ left: `${targetPct}%` }}
            title={`Target: ${targetPct}`}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-2">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>

      {/* Component breakdown. score / 100 with weight + evidence */}
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {components.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-2 w-14 shrink-0">
              {Math.round(c.value * 100)}/100
            </span>
            <span className="font-mono text-[11px] text-muted-2 w-10 shrink-0">
              ×{Math.round(c.weight * 100)}%
            </span>
            <span className="text-foreground">
              {c.label}
              {c.blurb && (
                <span className="text-muted-2"> · {c.blurb}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
