"use client";

/**
 * Usage meter. Polls /api/account/usage and renders a compact
 * "X of Y today" chip per feature. Supports two layouts:
 *   compact (chip): shown in Coach panel header. Single feature.
 *   detailed (table): shown on /account. All tracked features.
 *
 * Auto-refreshes every 30s while the panel is mounted so users see
 * the meter tick down as they use the app. Never blocks UI; renders
 * a placeholder during the first fetch.
 *
 * Per founder note 2026-04-24: "use consumption with very generous
 * limits and let them know how much they spent." This is the visible
 * meter that makes the volume-gate model feel like a budget the user
 * controls, not a wall they hit.
 */

import { useEffect, useState } from "react";

type Feature = "coach" | "briefing" | "multi_pick" | "verdict";

type FeatureUsage = {
  feature: Feature;
  used: number;
  cap: number;
  remaining: number;
  pct: number;
  near_cap: boolean;
};

type UsageResponse = {
  authenticated: boolean;
  tier: "free" | "pro";
  features: FeatureUsage[];
};

const LABELS: Record<Feature, string> = {
  coach: "Coach turns",
  briefing: "Briefings",
  multi_pick: "Multi-pick rollouts",
  verdict: "Scout verdicts",
};

const REFRESH_MS = 30 * 1000;

async function fetchUsage(): Promise<UsageResponse | null> {
  try {
    const res = await fetch("/api/account/usage", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as UsageResponse;
  } catch {
    return null;
  }
}

/**
 * Compact one-feature chip. Used in Coach panel header.
 *
 * "Coach: 3/5 today" green; "Coach: 5/5 today" amber/red.
 * Hidden for anonymous users (they'll get a sign-in prompt elsewhere).
 */
export function UsageChip({ feature }: { feature: Feature }) {
  const [usage, setUsage] = useState<FeatureUsage | null>(null);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await fetchUsage();
      if (cancelled || !data) return;
      setAuthed(data.authenticated);
      const f = data.features.find((x) => x.feature === feature);
      if (f) setUsage(f);
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [feature]);

  if (!authed) return null;
  if (!usage) return null;

  const tone = usage.remaining === 0
    ? "border-danger/60 text-danger"
    : usage.near_cap
      ? "border-warning/60 text-warning"
      : "border-border-strong text-muted";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}
      title={`${usage.used} of ${usage.cap} ${LABELS[feature].toLowerCase()} today. Resets at midnight UTC.`}
    >
      <span
        className={`inline-block h-1 w-1 rounded-full ${
          usage.remaining === 0
            ? "bg-danger"
            : usage.near_cap
              ? "bg-warning"
              : "bg-success"
        }`}
      />
      {usage.used}/{usage.cap} today
    </span>
  );
}

/**
 * Detailed all-features panel. Used on /account so the user can
 * see their full daily budget at a glance.
 */
export function UsageDetail() {
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const fresh = await fetchUsage();
      if (!cancelled && fresh) setData(fresh);
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!data || !data.authenticated) return null;

  return (
    <div className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Today's usage
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Resets midnight UTC · tier: {data.tier}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Generous daily caps so beta is meaningful for everyone. Hit a
        cap and want to keep going? Pro removes them.
      </p>
      <ul className="mt-4 space-y-3">
        {data.features.map((f) => (
          <li key={f.feature}>
            <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
              <span className="text-foreground">{LABELS[f.feature]}</span>
              <span
                className={
                  f.remaining === 0
                    ? "text-danger"
                    : f.near_cap
                      ? "text-warning"
                      : "text-muted"
                }
              >
                {f.used} of {f.cap} ({f.remaining} left)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-surface-2">
              <div
                className={`h-full ${
                  f.remaining === 0
                    ? "bg-danger/70"
                    : f.near_cap
                      ? "bg-warning/70"
                      : "bg-success/60"
                }`}
                style={{ width: `${Math.round(f.pct * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
