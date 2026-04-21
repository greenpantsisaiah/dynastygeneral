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

import { useCallback, useState, useSyncExternalStore } from "react";
import type { Briefing } from "@/lib/strategy/briefings/types";
import {
  appendBriefings,
  pinBriefing,
  readFeed,
  readPinned,
  subscribeBriefings,
  unpinBriefing,
} from "@/lib/strategy/briefings/store";
import { BriefingCard } from "./briefing-card";

// Stable empty references for SSR snapshots. useSyncExternalStore
// requires server snapshots to return the SAME reference each call.
const SSR_EMPTY_FEED: Briefing[] = [];
const SSR_EMPTY_PINNED: string[] = [];

export function BriefingFeed({
  leagueId,
  username,
}: {
  leagueId: string;
  username: string;
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

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinnedSet = new Set(pinnedIds);
  const pinnedBriefings = feed.filter((b) => pinnedSet.has(b.id));

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

  function togglePin(id: string) {
    if (pinnedSet.has(id)) unpinBriefing(leagueId, id);
    else pinBriefing(leagueId, id);
  }

  return (
    <section className="mt-8">
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
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
