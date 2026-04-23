"use client";

/**
 * Briefing Feed UI. The Intelligence Analyst's surface in the league hub.
 *
 * Two clearly-distinguished sections:
 *   1. War Room (top, prominent border) - user's pinned briefings.
 *      Their curated insights pane. Stable. Intentional. Each card
 *      can be unpinned to remove from this surface.
 *   2. Feed (below, scrollable) - chronological stream of all
 *      generated briefings. Always-fresh. Newest first. Cards can be
 *      pinned up to the War Room.
 *
 * "Run new analysis" button at top fans out 3-5 briefings into the
 * feed. Hits the server-side analyst route.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Briefing, BriefingKind, BriefingSeverity } from "@/lib/strategy/briefings/types";
import {
  appendBriefings,
  clearFeed,
  depositInBank,
  pinBriefing,
  readFeed,
  readPinned,
  readPinnedBank,
  removeFromBank,
  subscribeBriefings,
  unpinBriefing,
} from "@/lib/strategy/briefings/store";
import { BriefingCard, type CurrentRosterCounts } from "./briefing-card";
import {
  PaywallModal,
  readPaywallReason,
  type PaywallReason,
} from "@/components/billing/paywall-modal";

// Stable empty references for SSR snapshots. useSyncExternalStore
// requires server snapshots to return the SAME reference each call.
const SSR_EMPTY_FEED: Briefing[] = [];
const SSR_EMPTY_PINNED: string[] = [];
const SSR_EMPTY_BANK: Record<string, Briefing> = {};

// Server-side pinned-briefing row shape. Mirrors the pinned_briefings
// table columns we select. The `data` and `body` fields can be null;
// older rows may have a slightly different shape than the current
// types. The renderer is tolerant of missing optional fields.
type ServerPinnedRow = {
  briefing_id: string;
  kind: string;
  severity: string;
  headline: string;
  body: string | null;
  data: unknown;
  pinned_at: string;
};

function serverRowToBriefing(row: ServerPinnedRow): Briefing {
  // Reconstruct the Briefing meta as best we can from the stored
  // fields. The triggered_by/topic_tags/evidence we don't persist
  // server-side; render with conservative defaults so the card still
  // shows something useful.
  return {
    id: row.briefing_id,
    kind: row.kind as BriefingKind,
    severity: row.severity as BriefingSeverity,
    headline: row.headline,
    body: row.body ?? "",
    evidence: [],
    topic_tags: [],
    generated_at: row.pinned_at,
    triggered_by: "pinned",
    // Per-kind data is opaque here; the renderer's discriminated union
    // will accept it. We trust what the server stored.
    data: (row.data ?? {}) as never,
  } as Briefing;
}

export function BriefingFeed({
  leagueId,
  username,
  currentRosters,
  currentPickNo,
}: {
  leagueId: string;
  username: string;
  // Per-owner position counts and current pick number, captured server
  // side from the latest snapshot. Threaded into BriefingCard so
  // count-anchored briefings can be re-evaluated against current
  // state and marked resolved/outdated when the user has moved on.
  currentRosters?: CurrentRosterCounts | null;
  currentPickNo?: number | null;
}) {
  const subscribe = useCallback(
    (cb: () => void) => subscribeBriefings(leagueId, cb),
    [leagueId],
  );
  const feed = useSyncExternalStore(
    subscribe,
    useCallback(() => readFeed(leagueId), [leagueId]),
    () => SSR_EMPTY_FEED,
  );
  const pinnedIds = useSyncExternalStore(
    subscribe,
    useCallback(() => readPinned(leagueId), [leagueId]),
    () => SSR_EMPTY_PINNED,
  );
  const pinnedBank = useSyncExternalStore(
    subscribe,
    useCallback(() => readPinnedBank(leagueId), [leagueId]),
    () => SSR_EMPTY_BANK,
  );

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const pinnedSet = new Set(pinnedIds);
  // Pinned briefings come from the feed when present (always
  // preferred: it has the freshest evidence/preconditions); fall back
  // to the bank for ones that have rolled out of the feed or were
  // hydrated from the server.
  const seenPinned = new Set<string>();
  const pinnedBriefings: Briefing[] = [];
  for (const b of feed) {
    if (pinnedSet.has(b.id) && !seenPinned.has(b.id)) {
      pinnedBriefings.push(b);
      seenPinned.add(b.id);
    }
  }
  for (const id of pinnedIds) {
    if (seenPinned.has(id)) continue;
    const banked = pinnedBank[id];
    if (banked) {
      pinnedBriefings.push(banked);
      seenPinned.add(id);
    }
  }

  // Hydrate pinned briefings from the server on mount. Pro users get
  // cross-device War Room continuity. Free / anonymous users see an
  // empty server response and keep localStorage-only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/briefings/${leagueId}/pinned`);
        if (!res.ok) return;
        const { pinned } = (await res.json()) as { pinned: ServerPinnedRow[] };
        if (cancelled || pinned.length === 0) return;
        // Reconstruct briefings; merge ids into local pinned set; bank
        // the full payloads so we can render them when the feed
        // doesn't carry them.
        const reconstructed = pinned.map(serverRowToBriefing);
        depositInBank(leagueId, reconstructed);
        const localIds = readPinned(leagueId);
        const merged = Array.from(new Set([...localIds, ...pinned.map((p) => p.briefing_id)]));
        if (merged.length !== localIds.length) {
          // pinBriefing would re-write each individually; do a single
          // direct set to avoid N storage events.
          window.localStorage.setItem(
            `dc:briefing-pinned:${leagueId}`,
            JSON.stringify(merged),
          );
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: `dc:briefing-pinned:${leagueId}`,
            }),
          );
        }
      } catch {
        // Silent fallback; localStorage continues to work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  async function runAnalysis() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const url = new URL(
        `/api/briefings/run/${leagueId}`,
        window.location.origin,
      );
      if (username) url.searchParams.set("username", username);
      url.searchParams.set("trigger", "user requested");
      const res = await fetch(url.toString(), { method: "POST" });
      const reason = await readPaywallReason(res);
      if (reason) {
        setPaywall({ ...reason, nextPath: window.location.pathname });
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Analyst returned ${res.status}: ${text}`);
      }
      const data = (await res.json()) as { briefings: Briefing[] };
      appendBriefings(leagueId, data.briefings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function togglePin(id: string) {
    if (pinnedSet.has(id)) {
      unpinBriefing(leagueId, id);
      removeFromBank(leagueId, id);
      // Server unpin (Pro). Free / anonymous returns 200 with no
      // persistence; never blocks the UI.
      try {
        await fetch(
          `/api/briefings/${leagueId}/pinned?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
      } catch {
        // Optimistic local update already applied.
      }
      return;
    }
    // Pin: find the full briefing payload so the server can store it.
    const briefing = feed.find((b) => b.id === id) ?? pinnedBank[id];
    pinBriefing(leagueId, id, briefing);
    if (!briefing) return;
    try {
      await fetch(`/api/briefings/${leagueId}/pinned`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefing_id: briefing.id,
          kind: briefing.kind,
          severity: briefing.severity,
          headline: briefing.headline,
          body: briefing.body,
          data: briefing.data,
        }),
      });
    } catch {
      // Optimistic local pin already applied.
    }
  }

  function handleClear() {
    if (running) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear the briefing feed? Pinned items in the War Room are not affected.")
    ) {
      return;
    }
    clearFeed(leagueId);
  }

  return (
    <section className="mt-8">
      <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Intelligence briefings
          </div>
          <p className="mt-1 text-sm text-muted">
            Your analyst team posts takes here. Pin the ones worth keeping; the
            rest stay in the feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {feed.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={running}
              className="inline-flex h-9 items-center rounded-md border border-border-soft bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:border-danger/60 hover:text-danger"
              title="Clear the chronological feed. Pinned items in the War Room are kept."
            >
              Clear feed
            </button>
          )}
          <button
            type="button"
            onClick={runAnalysis}
            disabled={running}
            className={`inline-flex h-9 items-center rounded-md border px-3 text-xs font-semibold transition ${
              running
                ? "border-border-soft text-muted-2"
                : "border-accent/60 bg-surface text-accent hover:bg-accent hover:text-black"
            }`}
          >
            {running ? "Running..." : "Run new analysis"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-3 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* War Room */}
      {pinnedBriefings.length > 0 && (
        <div className="mt-5 rounded-lg border-2 border-success/50 bg-success/5 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-success">
              War Room · your pinned insights
            </div>
            <span className="font-mono text-xs text-muted-2">
              {pinnedBriefings.length} pinned
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pinnedBriefings.map((b) => (
              <BriefingCard
                key={`pin-${b.id}`}
                briefing={b}
                isPinned
                onTogglePin={() => togglePin(b.id)}
                currentRosters={currentRosters}
                currentPickNo={currentPickNo}
              />
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
            Feed · chronological
          </div>
          <span className="font-mono text-xs text-muted-2">
            {feed.length === 0 ? "no briefings yet" : `${feed.length} total`}
          </span>
        </div>
        {feed.length === 0 ? (
          <div className="mt-3 rounded-md border border-border-soft bg-surface px-4 py-6 text-center text-sm text-muted">
            No briefings yet. Hit{" "}
            <span className="text-accent">Run new analysis</span> above to have
            your analyst team produce takes on the current state.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {feed.map((b) => (
              <BriefingCard
                key={b.id}
                briefing={b}
                isPinned={pinnedSet.has(b.id)}
                onTogglePin={() => togglePin(b.id)}
                currentRosters={currentRosters}
                currentPickNo={currentPickNo}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
