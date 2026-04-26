"use client";

/**
 * Cookie consent banner. Env-gated, off by default.
 *
 * Today the privacy framing is "declaration is your consent" because
 * the only client cookie we set is `dw_<leagueId>` (a window
 * declaration cookie that only writes on explicit user action). This
 * banner is the proper alternative when real EU/UK traffic shows up.
 *
 * Enable via env: NEXT_PUBLIC_COOKIE_BANNER_ENABLED="true". When the
 * flag is off, the banner never renders. Both Accept and Decline
 * dismiss the banner for the session and persist the choice in
 * localStorage so a return visit doesn't re-prompt.
 *
 * What "Decline" actually does: today, nothing tangible. We don't
 * load analytics, ad pixels, or third-party trackers, so declining
 * has no behavioral impact yet. The banner is structured so that
 * when we do add Vercel Analytics or similar, the consent gate is
 * already in place: read `localStorage.getItem("dg:cookie-consent")`
 * before initializing any non-essential client.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "dg:cookie-consent";

type Consent = "accepted" | "declined" | null;

function readConsent(): Consent {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

function writeConsent(value: "accepted" | "declined"): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode / quota / disabled storage. The banner already
    // dismisses for this session via state below; persistence is
    // best-effort.
  }
}

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readConsent() == null) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss(value: "accepted" | "declined") {
    writeConsent(value);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-soft bg-background/95 px-4 py-4 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-foreground">
          We use a small number of cookies for sign-in and to remember your
          declared draft window per league. We do not load ad trackers or
          third-party analytics. See our{" "}
          <a href="/privacy" className="text-accent hover:underline">
            privacy policy
          </a>{" "}
          for details.
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => dismiss("declined")}
            className="rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-2 transition hover:border-accent/60 hover:text-foreground"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => dismiss("accepted")}
            className="rounded-md bg-accent px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
