"use client";

/**
 * Window weighting prompt. On first visit per league, asks the user
 * to declare their win-now / future bias. Once set, collapses into a
 * small chip with an "Edit" option.
 *
 * Drives: the overlay on WindowsBar, the default sort bias for the
 * ranker (Stage B+), and the drift warning when roster doesn't match
 * the declared target.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  declaredWindowKey,
  readDeclaredWindow,
  writeDeclaredWindow,
} from "@/lib/strategy/declared-window";
import {
  WINDOW_WEIGHTINGS,
  type WindowWeightingId,
} from "@/lib/strategy/windows/types";

function subscribeToStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function WindowWeightingPrompt({ leagueId }: { leagueId: string }) {
  const declared = useSyncExternalStore(
    subscribeToStorage,
    useCallback(() => readDeclaredWindow(leagueId), [leagueId]),
    () => null,
  );
  const [editing, setEditing] = useState(false);

  function choose(id: WindowWeightingId) {
    writeDeclaredWindow(leagueId, id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", { key: declaredWindowKey(leagueId) }),
      );
    }
    setEditing(false);
  }

  function reset() {
    writeDeclaredWindow(leagueId, null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", { key: declaredWindowKey(leagueId) }),
      );
    }
    setEditing(true);
  }

  // Compact chip when already declared and not editing
  if (declared && !editing) {
    const w = WINDOW_WEIGHTINGS.find((x) => x.id === declared);
    return (
      <div className="mt-6 inline-flex items-center gap-3 rounded-md border border-border-soft bg-surface px-3 py-2 text-xs">
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
          Window
        </span>
        <span className="font-semibold text-foreground">{w?.label}</span>
        <span className="font-mono text-xs text-muted-2">
          {w?.win_now_share}/{100 - (w?.win_now_share ?? 50)} now/future
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={reset}
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-danger"
        >
          Reset
        </button>
      </div>
    );
  }

  // Active picker (first visit OR user chose to edit)
  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-accent/50 bg-accent/5">
      <div className="border-b border-accent/20 px-5 py-3">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Declare your window
        </div>
        <div className="mt-1 text-lg font-semibold text-foreground">
          Win THIS year, build for later, or somewhere in between?
        </div>
        <p className="mt-1 text-sm text-muted">
          The most important strategic decision you make. Anchors every pick
          and trade recommendation. Change anytime.
        </p>
      </div>
      <div className="grid gap-px bg-accent/20 md:grid-cols-5">
        {WINDOW_WEIGHTINGS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => choose(w.id)}
            className={`group flex flex-col items-start gap-2 bg-surface px-4 py-4 text-left transition hover:bg-surface-2 ${
              declared === w.id ? "ring-1 ring-accent" : ""
            }`}
          >
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
              {w.win_now_share}/{100 - w.win_now_share}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {w.label}
            </span>
            <span className="text-xs leading-snug text-muted">{w.blurb}</span>
          </button>
        ))}
      </div>
      {editing && (
        <div className="border-t border-accent/20 px-5 py-2 text-right">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
