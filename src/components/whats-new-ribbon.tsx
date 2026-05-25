"use client";

/**
 * "What's new" ribbon. Slim, dismissible, fixed near the bottom-left
 * corner of the viewport. Surfaces the LATEST release so testers
 * notice shipped changes without a manual changelog email.
 *
 * Source of truth is `src/lib/changelog/releases.ts`. The ribbon
 * renders LATEST_RELEASE; the full flowing history lives at
 * /changelog. To re-show the ribbon for everyone, add a newer release
 * (its version date becomes the new dismissal key).
 *
 * localStorage tracks the last version the user dismissed; if they
 * have dismissed the latest version we hide.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { LATEST_RELEASE } from "@/lib/changelog/releases";

const LATEST_VERSION = LATEST_RELEASE.version;
const CHANGES = LATEST_RELEASE.changes;

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
          <>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {LATEST_RELEASE.title}
            </div>
            <ul className="mt-3 space-y-2.5 border-t border-border-soft pt-3">
              {CHANGES.map((c) => (
                <li
                  key={c.tag}
                  className="flex items-start gap-2 text-xs leading-snug"
                >
                  <span className="mt-0.5 inline-flex shrink-0 items-center rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                    {c.tag}
                  </span>
                  <span className="text-foreground">{c.text}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/changelog"
              onClick={dismiss}
              className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-accent transition hover:underline"
            >
              See all releases →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
