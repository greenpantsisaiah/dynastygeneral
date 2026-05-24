"use client";

/**
 * "What's new" ribbon. Slim, dismissible, fixed near the bottom-left
 * corner of the viewport. Surfaces recent shipped changes so testers
 * notice them without us having to send a manual changelog every
 * release.
 *
 * Versioning is intentionally manual: bump LATEST_VERSION when you
 * have something worth resurfacing. localStorage tracks the last
 * version the user dismissed; if they've dismissed >= LATEST_VERSION
 * we hide. Bumping the number re-shows for everyone.
 *
 * Out of scope for v1: per-route hiding, SSE-driven version push,
 * deeper /changelog page. Add when the manual rhythm starts to fail.
 */

import { useEffect, useState } from "react";

type Change = { tag: string; text: string };

const LATEST_VERSION = "2026-04-24";

const CHANGES: Change[] = [
  {
    tag: "DAY PASS",
    text: "One-shot 24h unlimited at the cap-hit moment. Bursty draft days don't need a subscription.",
  },
  {
    tag: "SAME-PATH THREATS",
    text: "Top 3 opponents chasing your archetype. Each comes with a one-click Coach intel prompt.",
  },
  {
    tag: "USAGE METER",
    text: "Visible \"X of Y today\" chip in Coach + full daily breakdown on /account.",
  },
  {
    tag: "COACH HONESTY",
    text: "Coach now sees your named roster and is rule-bound to verify before claiming \"you punted X.\"",
  },
];

const STORAGE_KEY = "dc:changelog-seen-version";

export function WhatsNewRibbon() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (seen !== LATEST_VERSION) setVisible(true);
    } catch {
      // localStorage blocked. Silently skip; no ribbon is fine.
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, LATEST_VERSION);
    } catch {
      // ignore; the in-memory state below still hides for the session
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      // Mobile: sit ABOVE the bottom-right Feedback pill (h-10 at bottom-4)
      // so the two fixed elements stack instead of colliding. Desktop
      // already separates them (ribbon left, feedback right).
      className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6 sm:justify-start sm:pl-6"
      role="status"
      aria-label="What's new"
    >
      <div
        className={`pointer-events-auto w-full max-w-md rounded-lg border border-accent/50 bg-surface/95 shadow-lg backdrop-blur transition-all ${
          expanded ? "p-4" : "px-3 py-2"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((s) => !s)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
              What's new · {LATEST_VERSION}
            </span>
            <span className="font-mono text-[10px] text-muted-2">
              {expanded ? "▼" : "▶"} {CHANGES.length}
            </span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 transition hover:text-foreground"
            title="Dismiss until the next release"
          >
            Got it ✕
          </button>
        </div>
        {expanded && (
          <ul className="mt-3 space-y-2.5 border-t border-border-soft pt-3">
            {CHANGES.map((c) => (
              <li key={c.tag} className="flex items-start gap-2 text-xs leading-snug">
                <span className="mt-0.5 inline-flex shrink-0 items-center rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                  {c.tag}
                </span>
                <span className="text-foreground">{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
