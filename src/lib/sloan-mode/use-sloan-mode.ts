"use client";

/**
 * Client-side Sloan mode hook. Reads the cookie value (set by the
 * server) on mount and exposes a toggle that POSTs to the API and
 * optimistically updates local state. Components consume via:
 *
 *   const { mode, toggle } = useSloanMode();
 *   if (mode === "on") { ... show CIs and provenance ... }
 *
 * Default is "off" (polished casual) until the cookie is read.
 */

import { useCallback, useEffect, useState } from "react";
import { SLOAN_COOKIE_NAME, type SloanMode } from "./cookie";

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq) === name) return decodeURIComponent(c.slice(eq + 1));
  }
  return null;
}

export function useSloanMode(): {
  mode: SloanMode;
  toggle: () => Promise<void>;
  isLoaded: boolean;
} {
  const [mode, setMode] = useState<SloanMode>("off");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const raw = readCookieValue(SLOAN_COOKIE_NAME);
    if (raw === "on" || raw === "off") setMode(raw);
    setIsLoaded(true);
  }, []);

  const toggle = useCallback(async () => {
    const next: SloanMode = mode === "on" ? "off" : "on";
    setMode(next);
    try {
      await fetch("/api/sloan-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
    } catch {
      // Optimistic; if the request fails the cookie stays unchanged
      // server-side. Next render reconciles.
    }
  }, [mode]);

  return { mode, toggle, isLoaded };
}
