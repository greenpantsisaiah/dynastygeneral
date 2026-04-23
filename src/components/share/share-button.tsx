"use client";

/**
 * Generic share button. Tries the Web Share API first (one-tap share
 * sheet on mobile + supported desktops), falls back to copy-to-
 * clipboard with a brief "Copied!" affordance.
 *
 * Designed for scout reports: every public scout URL is a marketing
 * surface. The friction between "I just got scouted" and "I shared
 * this with my league" is the difference between viral growth and
 * traffic that dies on the page.
 */

import { useEffect, useState } from "react";

type Status = "idle" | "copied" | "shared" | "error";

export function ShareButton({
  title,
  text,
  url,
  className = "",
}: {
  title: string;
  text: string;
  url?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  // Resolve the URL on the client so server-render doesn't bake a
  // localhost or stale value. window.location.href is the source of
  // truth for what the user is actually looking at.
  useEffect(() => {
    if (url) {
      setResolvedUrl(url);
    } else if (typeof window !== "undefined") {
      setResolvedUrl(window.location.href);
    }
  }, [url]);

  async function share() {
    const target = resolvedUrl ?? "";
    if (!target) return;

    // Web Share API path (mobile + Safari + recent Chrome desktop).
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url: target });
        setStatus("shared");
        setTimeout(() => setStatus("idle"), 1500);
        return;
      } catch (err) {
        // AbortError = user cancelled the sheet; that's fine, no error.
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        // Other errors fall through to clipboard.
      }
    }

    // Clipboard fallback.
    try {
      const payload = `${text}\n\n${target}`;
      await navigator.clipboard.writeText(payload);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const label =
    status === "copied"
      ? "Copied to clipboard"
      : status === "shared"
        ? "Shared"
        : status === "error"
          ? "Couldn't copy"
          : "Share";

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent ${className}`}
    >
      {label}
      {status === "idle" && (
        <span className="ml-2 text-accent" aria-hidden>
          →
        </span>
      )}
    </button>
  );
}
