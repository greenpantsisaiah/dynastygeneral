"use client";

/**
 * Draft Journal. Shows the user's own picks so far in this draft,
 * each one tagged with what the engine's standing call was at the
 * time (read from the same localStorage history the continuity chip
 * uses). Surfaces alignment between what the user took and what was
 * recommended, with a "match rate" summary at the top.
 *
 * Designed as a self-awareness surface, NOT as a guidance surface.
 * It lives BELOW the Decision Quadrant on the hub: post-action
 * review, distinct from the action zone above.
 *
 * Cost: zero. Reads the same localStorage as the continuity chip;
 * server-side just resolves player names for picks_made (already
 * cheap). No new API routes, no new schema, no LLM calls.
 *
 * v1 limitations:
 * - Picks made BEFORE the continuity chip shipped have no recorded
 *   recommendation; we render "not logged" for those rows.
 * - localStorage is per-device; if the user drafts across devices
 *   the journal will only see picks made from the device that has
 *   the cookie state. This is acceptable for v1.
 */

import { useEffect, useState } from "react";

type ServerEntry = {
  pick_no: number;
  pick_label: string;
  taken_player_id: string;
  taken_player_name: string;
};

type HistoryEntry = {
  user_pick_no: number;
  player_id: string;
  player_name: string;
  first_seen_ms: number;
  last_seen_ms: number;
  refresh_count: number;
};

type StoredHistory = {
  league_id: string;
  entries: HistoryEntry[];
};

type EnrichedRow = {
  pick_no: number;
  pick_label: string;
  taken_player_id: string;
  taken_player_name: string;
  recommended: { player_id: string; player_name: string } | null;
  followed: boolean | null;
};

function storageKey(leagueId: string): string {
  return `dg_rec_history_${leagueId}`;
}

function readHistory(leagueId: string): StoredHistory {
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId));
    if (!raw) return { league_id: leagueId, entries: [] };
    const parsed = JSON.parse(raw) as StoredHistory;
    if (parsed.league_id !== leagueId) {
      return { league_id: leagueId, entries: [] };
    }
    return parsed;
  } catch {
    return { league_id: leagueId, entries: [] };
  }
}

export function DraftJournal({
  leagueId,
  serverEntries,
}: {
  leagueId: string;
  serverEntries: ServerEntry[];
}) {
  const [rows, setRows] = useState<EnrichedRow[]>([]);

  useEffect(() => {
    const history = readHistory(leagueId);
    // For each user pick, find the LAST history entry whose
    // user_pick_no matches. That is the standing call at the moment
    // the user took the pick.
    const enriched: EnrichedRow[] = serverEntries.map((entry) => {
      const matches = history.entries.filter(
        (h) => h.user_pick_no === entry.pick_no,
      );
      if (matches.length === 0) {
        return {
          ...entry,
          recommended: null,
          followed: null,
        };
      }
      const last = matches[matches.length - 1];
      return {
        ...entry,
        recommended: {
          player_id: last.player_id,
          player_name: last.player_name,
        },
        followed: last.player_id === entry.taken_player_id,
      };
    });
    setRows(enriched);
  }, [leagueId, serverEntries]);

  if (serverEntries.length === 0) return null;

  const loggedRows = rows.filter((r) => r.followed !== null);
  const matched = loggedRows.filter((r) => r.followed === true).length;
  const overrideCount = loggedRows.length - matched;
  const matchPct =
    loggedRows.length > 0
      ? Math.round((matched / loggedRows.length) * 100)
      : null;

  return (
    <section className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Your draft journal
          </div>
          <p className="mt-1 text-sm text-muted">
            Every pick you&rsquo;ve made this draft, tagged with the
            standing call at that moment. Not guidance: a record of
            how you&rsquo;ve been operating against the engine.
          </p>
        </div>
        {matchPct != null && (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
              Alignment
            </div>
            <div className="text-sm font-semibold text-foreground">
              <span className="text-accent">{matched}</span> matched ·{" "}
              <span className="text-warning">{overrideCount}</span>{" "}
              override{overrideCount === 1 ? "" : "s"}{" "}
              <span className="font-mono text-[10px] text-muted-2">
                ({matchPct}%)
              </span>
            </div>
          </div>
        )}
      </div>

      <ol className="mt-4 space-y-2">
        {rows
          .slice()
          .reverse()
          .map((row) => {
            return (
              <li
                key={row.pick_no}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2 min-w-[3.5rem]">
                  {row.pick_label}
                </span>
                <span className="font-semibold text-foreground">
                  {row.taken_player_name}
                </span>
                {row.followed === true && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    matched the call
                  </span>
                )}
                {row.followed === false && row.recommended && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                    override · call was {row.recommended.player_name}
                  </span>
                )}
                {row.followed === null && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                    no call logged for this pick
                  </span>
                )}
              </li>
            );
          })}
      </ol>
    </section>
  );
}
